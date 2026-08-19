import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class PasskeyLoginOptionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PasskeyVerifyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  challengeId!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  credential!: Record<string, unknown>;
}

export class RenamePasskeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
