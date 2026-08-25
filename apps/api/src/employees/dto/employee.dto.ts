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
  ValidateIf,
} from "class-validator";
import { IsNotFutureDate } from "../../_shared/validators/is-not-future-date.validator";

export class CreateEmployeeDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  dateJoined!: string;

  @ApiPropertyOptional({ example: "1995-06-15" })
  @IsOptional()
  @IsDateString()
  @IsNotFutureDate({ message: "Date of birth cannot be in the future" })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: "Initial salary in NPR" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialSalaryNpr?: number;
}

export class UpdateEmployeeDto {
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateJoined?: string;

  @ApiPropertyOptional({ example: "1995-06-15", nullable: true })
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== "")
  @IsDateString()
  @IsNotFutureDate({ message: "Date of birth cannot be in the future" })
  dateOfBirth?: string | null;
}

export class CreateEmergencyContactDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phoneNumber!: string;
}

export class UpdateEmergencyContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phoneNumber?: string;
}

export class MarkLeftDto {
  @ApiProperty({ example: "2026-08-01" })
  @IsDateString()
  dateLeft!: string;
}

export class CreateSalaryEntryDto {
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

export class UpdateSalaryEntryDto {
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
