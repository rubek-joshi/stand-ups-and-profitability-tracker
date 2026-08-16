import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
