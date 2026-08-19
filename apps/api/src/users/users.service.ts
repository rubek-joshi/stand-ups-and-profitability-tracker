import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, User } from "@workspace/database";
import * as bcrypt from "bcrypt";
import { AuditService } from "../audit/audit.service";
import { CasbinService } from "../casbin/casbin.service";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateUserDto,
  SetUserPasswordDto,
  UpdateUserDto,
  USER_ROLES,
} from "./dto/user.dto";
import { UserResponseDto } from "./dto/user-response.dto";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly casbinService: CasbinService,
    private readonly auditService: AuditService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prismaService.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: { id },
      include: {
        standupPreferredGroup: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async findAll(filters: { q?: string; page?: string; pageSize?: string } = {}) {
    const q = filters.q?.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        orderBy: { name: "asc" },
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.user.count({ where }),
    ]);
    const roleMap = await this.casbinService.getRoleMap(users.map((u) => u.id));
    const data = users.map((user) =>
      this.toResponse(user, roleMap.get(user.id) ?? null),
    );
    return paginatedResult(data, total, pagination);
  }

  async create(dto: CreateUserDto, actorId: string): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException("A user with this email already exists");
    }
    this.assertValidRole(dto.role);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prismaService.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash,
        isActive: true,
        mustChangePassword: dto.mustChangePassword ?? false,
      },
    });
    await this.casbinService.setRoleForUser(user.id, dto.role);
    await this.auditService.write({
      actorId,
      action: AuditAction.USER_CREATED,
      targetType: "User",
      targetId: user.id,
      metadata: {
        after: this.toResponse(user, dto.role),
      },
    });
    return this.toResponse(user, dto.role);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
  ): Promise<UserResponseDto> {
    const before = await this.findById(id);
    const beforeRole = await this.casbinService.getPrimaryRoleForUser(id);

    if (id === actorId) {
      if (dto.role !== undefined && dto.role !== beforeRole) {
        throw new BadRequestException("You cannot change your own role");
      }
      if (dto.isActive === false) {
        throw new BadRequestException("You cannot deactivate yourself");
      }
    }

    if (dto.role !== undefined) {
      this.assertValidRole(dto.role);
    }

    let email = before.email;
    if (dto.email !== undefined) {
      email = dto.email.trim().toLowerCase();
      if (email !== before.email) {
        const existing = await this.findByEmail(email);
        if (existing && existing.id !== id) {
          throw new ConflictException("A user with this email already exists");
        }
      }
    }

    const user = await this.prismaService.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.mustChangePassword !== undefined
          ? { mustChangePassword: dto.mustChangePassword }
          : {}),
      },
    });

    let role = beforeRole;
    if (dto.role !== undefined && dto.role !== beforeRole) {
      await this.casbinService.setRoleForUser(id, dto.role);
      role = dto.role;
    }

    if (dto.isActive === false && before.isActive) {
      await this.auditService.write({
        actorId,
        action: AuditAction.USER_DEACTIVATED,
        targetType: "User",
        targetId: id,
        metadata: {
          before: this.toResponse(before, beforeRole),
          after: this.toResponse(user, role),
        },
      });
    } else if (dto.isActive === true && !before.isActive) {
      await this.auditService.write({
        actorId,
        action: AuditAction.USER_REACTIVATED,
        targetType: "User",
        targetId: id,
        metadata: {
          before: this.toResponse(before, beforeRole),
          after: this.toResponse(user, role),
        },
      });
    } else {
      await this.auditService.write({
        actorId,
        action: AuditAction.USER_UPDATED,
        targetType: "User",
        targetId: id,
        metadata: {
          before: this.toResponse(before, beforeRole),
          after: this.toResponse(user, role),
        },
      });
    }

    return this.toResponse(user, role);
  }

  async recordLogin(userId: string): Promise<User> {
    const user = await this.prismaService.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
    await this.auditService.write({
      actorId: userId,
      action: AuditAction.USER_LOGIN,
      targetType: "User",
      targetId: userId,
    });
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "New password must be different from the current password",
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });
    const role = await this.casbinService.getPrimaryRoleForUser(userId);
    await this.auditService.write({
      actorId: userId,
      action: AuditAction.USER_PASSWORD_CHANGED,
      targetType: "User",
      targetId: userId,
    });
    return this.toResponse(updated, role);
  }

  async setPassword(
    id: string,
    dto: SetUserPasswordDto,
    actorId: string,
  ): Promise<UserResponseDto> {
    await this.findById(id);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const mustChangePassword = dto.mustChangePassword ?? true;
    const updated = await this.prismaService.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword,
      },
    });
    const role = await this.casbinService.getPrimaryRoleForUser(id);
    await this.auditService.write({
      actorId,
      action: AuditAction.USER_PASSWORD_CHANGED,
      targetType: "User",
      targetId: id,
      metadata: {
        mustChangePassword,
        setByAdmin: true,
      },
    });
    return this.toResponse(updated, role);
  }

  async updateMyPreferences(
    userId: string,
    dto: {
      standupScopePreference?: "ask" | "everyone" | "group";
      standupPreferredGroupId?: string | null;
    },
  ): Promise<UserResponseDto> {
    const preference =
      dto.standupScopePreference ??
      (await this.findById(userId)).standupScopePreference;

    let preferredGroupId =
      dto.standupPreferredGroupId !== undefined
        ? dto.standupPreferredGroupId
        : (await this.findById(userId)).standupPreferredGroupId;

    if (preference === "ask" || preference === "everyone") {
      preferredGroupId = null;
    } else if (preference === "group") {
      if (!preferredGroupId) {
        throw new BadRequestException(
          "standupPreferredGroupId is required when preference is group",
        );
      }
      const group = await this.prismaService.employeeGroup.findUnique({
        where: { id: preferredGroupId },
      });
      if (!group) {
        throw new NotFoundException(
          `Employee group ${preferredGroupId} not found`,
        );
      }
    }

    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        standupScopePreference: preference,
        standupPreferredGroupId: preferredGroupId,
      },
      include: {
        standupPreferredGroup: { select: { id: true, name: true } },
      },
    });
    const role = await this.casbinService.getPrimaryRoleForUser(userId);
    return this.toResponse(updated, role);
  }

  async toResponseAsync(user: User): Promise<UserResponseDto> {
    const role = await this.casbinService.getPrimaryRoleForUser(user.id);
    const full =
      "standupPreferredGroup" in user
        ? user
        : await this.prismaService.user.findUnique({
            where: { id: user.id },
            include: {
              standupPreferredGroup: { select: { id: true, name: true } },
            },
          });
    return this.toResponse(full ?? user, role);
  }

  toResponse(
    user: User & {
      standupPreferredGroup?: { id: string; name: string } | null;
    },
    role?: string | null,
  ): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      role: role ?? null,
      standupScopePreference: user.standupScopePreference,
      standupPreferredGroupId: user.standupPreferredGroupId,
      standupPreferredGroup: user.standupPreferredGroup ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private assertValidRole(role: string): void {
    if (!(USER_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }
  }
}
