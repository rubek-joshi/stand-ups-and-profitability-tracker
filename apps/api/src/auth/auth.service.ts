import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
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
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });
    return {
      accessToken,
      user: this.usersService.toResponse(user),
    };
  }
}
