import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator.js";
import { AuthUser } from "../auth/types/auth-user.type.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator.js";
import { PoliciesGuard } from "../casbin/guards/policies.guard.js";
import { TestSmtpDto } from "./dto/test-smtp.dto.js";
import { UpdateSettingsDto } from "./dto/update-settings.dto.js";
import { SettingsService } from "./settings.service.js";

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermission("settings", "read")
  @ApiOperation({ summary: "Get org settings" })
  async get() {
    return this.settingsService.get();
  }

  @Patch()
  @RequirePermission("settings", "*")
  @ApiOperation({ summary: "Update org settings (super admin)" })
  async update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settingsService.update(dto, user.id);
  }

  @Post("smtp/test")
  @RequirePermission("settings", "*")
  @ApiOperation({ summary: "Send a test email using saved SMTP settings" })
  async testSmtp(@Body() dto: TestSmtpDto, @CurrentUser() user: AuthUser) {
    return this.settingsService.sendTestEmail(dto.to, user.id);
  }
}
