import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateInvoiceDto {
  @ApiPropertyOptional({
    description: 'Bill a project directly. Exactly one of projectId or amcId.',
  })
  @ValidateIf((o: CreateInvoiceDto) => !o.amcId)
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Bill a paid AMC. Exactly one of projectId or amcId.',
  })
  @ValidateIf((o: CreateInvoiceDto) => !o.projectId)
  @IsString()
  amcId?: string;

  @ApiProperty({ example: 'INV-001' })
  @IsString()
  @MaxLength(50)
  invoiceNumber!: string;

  @ApiProperty({ example: '2026-08-26' })
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty({ description: 'Invoice amount in NPR (ex-VAT)' })
  @IsNumber()
  @Min(0.01)
  amountNpr!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({
    description: 'Bill a project directly. Exactly one of projectId or amcId.',
  })
  @ValidateIf((o: UpdateInvoiceDto) => !o.amcId)
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Bill a paid AMC. Exactly one of projectId or amcId.',
  })
  @ValidateIf((o: UpdateInvoiceDto) => !o.projectId)
  @IsString()
  amcId?: string;

  @ApiProperty({ example: 'INV-001' })
  @IsString()
  @MaxLength(50)
  invoiceNumber!: string;

  @ApiProperty({ example: '2026-08-26' })
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty({ description: 'Invoice amount in NPR (ex-VAT)' })
  @IsNumber()
  @Min(0.01)
  amountNpr!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class MarkInvoicePaidDto {
  @ApiProperty({ example: '2026-08-26' })
  @IsDateString()
  paymentDate!: string;
}
