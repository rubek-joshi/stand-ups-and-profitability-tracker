import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class MarkVatPaidDto {
  @ApiPropertyOptional({
    description: "Amount to clear in NPR. Omit to clear the full unpaid balance.",
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amountNpr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
