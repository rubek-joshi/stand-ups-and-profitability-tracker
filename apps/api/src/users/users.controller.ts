import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { CreateUserDto, SetUserPasswordDto, UpdateUserDto } from "./dto/user.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission("users", "*")
  @ApiOperation({ summary: "Create user" })
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("users", "read")
  @ApiOperation({ summary: "List users" })
  async findAll(
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.usersService.findAll({ q, page, pageSize });
  }

  @Get(":id")
  @RequirePermission("users", "read")
  @ApiOperation({ summary: "Get user" })
  async findOne(@Param("id") id: string) {
    const user = await this.usersService.findById(id);
    return this.usersService.toResponseAsync(user);
  }

  @Post(":id/password")
  @RequirePermission("users", "*")
  @ApiOperation({ summary: "Set a user's password (admin)" })
  async setPassword(
    @Param("id") id: string,
    @Body() dto: SetUserPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.setPassword(id, dto, user.id);
  }

  @Patch(":id")
  @RequirePermission("users", "*")
  @ApiOperation({ summary: "Update user (role, status, profile)" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(id, dto, user.id);
  }
}
