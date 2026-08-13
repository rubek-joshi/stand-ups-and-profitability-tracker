import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AmcStatus } from "@workspace/database";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class SetAmcDto {
  @ApiProperty({ example: "2026-08-13" })
  @IsDateString()
  setDate!: string;

  @ApiProperty({ example: "2027-08-13" })
  @IsDateString()
  freeUntilDate!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;

  @ApiPropertyOptional({ description: "AMC amount in NPR" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amcAmountNpr?: number;
}

export class UpdateAmcDto {
  @ApiPropertyOptional({ enum: AmcStatus })
  @IsOptional()
  @IsEnum(AmcStatus)
  status?: AmcStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  freeUntilDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amcAmountNpr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVatApplicable?: boolean;
}

export class CancelAmcDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
