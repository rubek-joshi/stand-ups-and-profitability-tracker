import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  paidLeaveDaysPerMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  amcReminderLeadDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  healthHealthyMinPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  healthAtRiskMinPercent?: number;
}
