import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { ChangePasswordDto } from "../users/dto/user.dto";
import { LoginDto } from "./dto/login.dto";
import { LoginResponseDto } from "./dto/login-response.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const isValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const updated = await this.usersService.recordLogin(user.id);
    const accessToken = await this.jwtService.signAsync({
      sub: updated.id,
      email: updated.email,
    });
    return {
      accessToken,
      user: await this.usersService.toResponseAsync(updated),
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    await this.usersService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true };
  }
}
