import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiProperty({ type: [String], description: "One or more category IDs" })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categoryIds!: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: "Budget in NPR (converted to paisa)" })
  @IsNumber()
  @Min(0)
  budgetNpr!: number;

  @ApiProperty({ example: "2026-01-01" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: "2026-06-30" })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetNpr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;
}

export class AssignEmployeeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;
}

export class AssignCoreMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  coreMemberId!: string;
}

export class CreateExtensionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: "Extension amount in NPR; defaults to 0" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountNpr?: number;

  @ApiProperty({
    example: "2026-12-31",
    description: "New project end date (must be after the current end date)",
  })
  @IsDateString()
  endDate!: string;
}
