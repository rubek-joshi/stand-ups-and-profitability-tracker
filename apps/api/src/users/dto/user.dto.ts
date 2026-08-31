import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export const USER_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "standup_taker",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES)
  role!: UserRole;

  @ApiPropertyOptional({
    description: "Require the user to change password on next login",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class SetUserPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    description: "Require the user to change this password on next login",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateMyPreferencesDto {
  @ApiPropertyOptional({ enum: ["ask", "everyone", "group"] })
  @IsOptional()
  @IsIn(["ask", "everyone", "group"])
  standupScopePreference?: "ask" | "everyone" | "group";

  @ApiPropertyOptional({ enum: ["card", "table"] })
  @IsOptional()
  @IsIn(["card", "table"])
  standupLayoutPreference?: "card" | "table";

  @ApiPropertyOptional({ enum: ["off", "muted", "on"] })
  @IsOptional()
  @IsIn(["off", "muted", "on"])
  standupProjectAccentPreference?: "off" | "muted" | "on";

  @ApiPropertyOptional({
    nullable: true,
    description: "Required when preference is group; null clears preferred group",
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsString()
  standupPreferredGroupId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: "Custom stand-up employee ordering preference",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  standupEmployeeOrder?: string[];
}
