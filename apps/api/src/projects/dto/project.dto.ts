import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsHexColor,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from "class-validator";

/** Default project accent — matches app --primary teal as hex. */
export const DEFAULT_PROJECT_THEME_COLOR = "#168A6F";

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

  @ApiPropertyOptional({
    example: DEFAULT_PROJECT_THEME_COLOR,
    description: "Hex accent color (#RRGGBB) used in stand-ups",
  })
  @IsOptional()
  @IsHexColor()
  themeColor?: string;

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

  @ApiPropertyOptional({
    example: DEFAULT_PROJECT_THEME_COLOR,
    description: "Hex accent color (#RRGGBB) used in stand-ups",
  })
  @IsOptional()
  @IsHexColor()
  themeColor?: string;

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

  @ApiProperty({ example: "2026-01-15", description: "First day assigned" })
  @IsDateString()
  assignedAt!: string;

  @ApiPropertyOptional({
    example: "2026-06-30",
    description: "Last day assigned (inclusive). Omit if still assigned.",
  })
  @IsOptional()
  @IsDateString()
  unassignedAt?: string;
}

export class AssignEmployeesBulkDto {
  @ApiProperty({ type: [String], description: "One or more employee IDs" })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  employeeIds!: string[];

  @ApiProperty({ example: "2026-01-15", description: "First day assigned" })
  @IsDateString()
  assignedAt!: string;

  @ApiPropertyOptional({
    example: "2026-06-30",
    description: "Last day assigned (inclusive). Omit if still assigned.",
  })
  @IsOptional()
  @IsDateString()
  unassignedAt?: string;
}

export class UnassignEmployeeDto {
  @ApiPropertyOptional({
    example: "2026-06-30",
    description: "Last day assigned (inclusive). Defaults to today.",
  })
  @IsOptional()
  @IsDateString()
  unassignedAt?: string;
}

export class AssignCoreMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  coreMemberId!: string;

  @ApiProperty({ example: "2026-01-15", description: "First day assigned" })
  @IsDateString()
  assignedAt!: string;

  @ApiPropertyOptional({
    example: "2026-06-30",
    description: "Last day assigned (inclusive). Omit if still assigned.",
  })
  @IsOptional()
  @IsDateString()
  unassignedAt?: string;
}

export class AssignCoreMembersBulkDto {
  @ApiProperty({ type: [String], description: "One or more core member IDs" })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  coreMemberIds!: string[];

  @ApiProperty({ example: "2026-01-15", description: "First day assigned" })
  @IsDateString()
  assignedAt!: string;

  @ApiPropertyOptional({
    example: "2026-06-30",
    description: "Last day assigned (inclusive). Omit if still assigned.",
  })
  @IsOptional()
  @IsDateString()
  unassignedAt?: string;
}

export class UnassignCoreMemberDto {
  @ApiPropertyOptional({
    example: "2026-06-30",
    description: "Last day assigned (inclusive). Defaults to today.",
  })
  @IsOptional()
  @IsDateString()
  unassignedAt?: string;
}

export class CreateProjectLinkDto {
  @ApiProperty({ example: "Figma" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiProperty({ example: "https://www.figma.com/design/abc" })
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  url!: string;
}

export class UpdateProjectLinkDto {
  @ApiPropertyOptional({ example: "Figma" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ example: "https://www.figma.com/design/abc" })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  url?: string;
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
