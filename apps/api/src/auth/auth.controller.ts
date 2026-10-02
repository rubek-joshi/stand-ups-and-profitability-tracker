import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../_shared/decorators/current-user.decorator.js";
import { UsersService } from "../users/users.service.js";
import {
  ChangePasswordDto,
  UpdateMyPreferencesDto,
} from "../users/dto/user.dto.js";
import {
  AuthControllerDocs,
  ChangePasswordDocs,
  LoginDocs,
  MeDocs,
} from "./auth.swagger.js";
import { AuthService } from "./auth.service.js";
import { PasskeysService } from "./passkeys.service.js";
import { LoginDto } from "./dto/login.dto.js";
import {
  PasskeyLoginOptionsDto,
  PasskeyVerifyDto,
  RenamePasskeyDto,
} from "./dto/passkey.dto.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { AuthUser } from "./types/auth-user.type.js";

@AuthControllerDocs()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly passkeysService: PasskeysService,
  ) {}

  @Post("login")
  @LoginDocs()
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post("passkeys/login/options")
  @ApiOperation({ summary: "Begin passkey login" })
  async passkeyLoginOptions(@Body() dto?: PasskeyLoginOptionsDto) {
    return this.passkeysService.loginOptions(dto?.email);
  }

  @Post("passkeys/login/verify")
  @ApiOperation({ summary: "Complete passkey login" })
  async passkeyLoginVerify(@Body() dto: PasskeyVerifyDto) {
    return this.passkeysService.verifyLogin(dto.challengeId, dto.credential);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @MeDocs()
  async me(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.findById(authUser.id);
    return this.usersService.toResponseAsync(user);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  @MeDocs()
  async updateMe(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: UpdateMyPreferencesDto,
  ) {
    return this.usersService.updateMyPreferences(authUser.id, dto);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @ChangePasswordDocs()
  async changePassword(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(authUser.id, dto);
  }

  @Get("passkeys")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List passkeys for the current user" })
  async listPasskeys(@CurrentUser() authUser: AuthUser) {
    return this.passkeysService.list(authUser.id);
  }

  @Post("passkeys/register/options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Begin passkey registration" })
  async registerOptions(@CurrentUser() authUser: AuthUser) {
    return this.passkeysService.registrationOptions(authUser.id);
  }

  @Post("passkeys/register/verify")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Complete passkey registration" })
  async registerVerify(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: PasskeyVerifyDto,
    @Req() req: Request,
  ) {
    return this.passkeysService.verifyRegistration(
      authUser.id,
      dto.challengeId,
      dto.credential,
      req.headers,
    );
  }

  @Patch("passkeys/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Rename a passkey" })
  async renamePasskey(
    @CurrentUser() authUser: AuthUser,
    @Param("id") id: string,
    @Body() dto: RenamePasskeyDto,
  ) {
    return this.passkeysService.rename(authUser.id, id, dto.name);
  }

  @Delete("passkeys/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove a passkey" })
  async removePasskey(
    @CurrentUser() authUser: AuthUser,
    @Param("id") id: string,
  ) {
    return this.passkeysService.remove(authUser.id, id);
  }
}
