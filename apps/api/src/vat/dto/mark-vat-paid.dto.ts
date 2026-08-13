import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class MarkVatPaidDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
