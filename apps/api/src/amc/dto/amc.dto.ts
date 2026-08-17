import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  AmcRenewalDecision,
  AmcStatus,
  AmcType,
} from "@workspace/database";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateAmcDto {
  @ApiProperty()
  @IsString()
  projectId!: string;

  @ApiProperty({ enum: AmcType, default: AmcType.complimentary })
  @IsEnum(AmcType)
  type!: AmcType;

  @ApiProperty({ example: "2026-08-13" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: "2027-08-13" })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;

  @ApiPropertyOptional({ description: "AMC amount in NPR (paid contracts)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amcAmountNpr?: number;
}

/** @deprecated Prefer CreateAmcDto — kept for project-detail compatibility */
export class SetAmcDto {
  @ApiProperty({ example: "2026-08-13" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: "2027-08-13" })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ enum: AmcType, default: AmcType.complimentary })
  @IsOptional()
  @IsEnum(AmcType)
  type?: AmcType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;

  @ApiPropertyOptional({ description: "AMC amount in NPR" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amcAmountNpr?: number;

  /** Legacy aliases */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsDateString()
  setDate?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsDateString()
  freeUntilDate?: string;
}

export class UpdateAmcDto {
  @ApiPropertyOptional({ enum: AmcStatus })
  @IsOptional()
  @IsEnum(AmcStatus)
  status?: AmcStatus;

  @ApiPropertyOptional({ enum: AmcType })
  @IsOptional()
  @IsEnum(AmcType)
  type?: AmcType;

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
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amcAmountNpr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;

  @ApiPropertyOptional({ enum: AmcRenewalDecision })
  @IsOptional()
  @IsEnum(AmcRenewalDecision)
  renewalDecision?: AmcRenewalDecision;
}

export class CancelAmcDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class RenewalDecisionDto {
  @ApiProperty({ enum: [AmcRenewalDecision.renewed, AmcRenewalDecision.declined] })
  @IsEnum(AmcRenewalDecision)
  decision!: AmcRenewalDecision;

  @ApiPropertyOptional({ description: "Optional remark when declining" })
  @IsOptional()
  @IsString()
  remark?: string;
}
