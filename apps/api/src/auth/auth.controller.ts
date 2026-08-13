import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { UsersService } from "../users/users.service";
import { AuthControllerDocs, LoginDocs, MeDocs } from "./auth.swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthUser } from "./types/auth-user.type";

@AuthControllerDocs()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post("login")
  @LoginDocs()
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @MeDocs()
  async me(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.findById(authUser.id);
    return this.usersService.toResponse(user);
  }
}
