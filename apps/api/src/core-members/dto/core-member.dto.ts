import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateCoreMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactNumber?: string;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  dateJoined!: string;

  @ApiPropertyOptional({ description: "Initial salary in NPR" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialSalaryNpr?: number;
}

export class UpdateCoreMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateJoined?: string;
}

export class MarkCoreMemberLeftDto {
  @ApiProperty({ example: "2026-08-01" })
  @IsDateString()
  dateLeft!: string;
}

export class CreateCoreMemberSalaryDto {
  @ApiProperty({ description: "Salary in NPR" })
  @IsNumber()
  @Min(0)
  salaryNpr!: number;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  effectiveDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateCoreMemberSalaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryNpr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
