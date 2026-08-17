import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { StandupScopePreference } from "@workspace/database";

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String, format: "date-time" })
  lastLoginAt!: Date | null;

  @ApiPropertyOptional()
  role?: string | null;

  @ApiProperty({ enum: StandupScopePreference })
  standupScopePreference!: StandupScopePreference;

  @ApiPropertyOptional({ nullable: true, type: String })
  standupPreferredGroupId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  standupPreferredGroup?: { id: string; name: string } | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
