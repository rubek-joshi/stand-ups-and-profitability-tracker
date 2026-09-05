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

export class CreateWriteOffDto {
  @ApiPropertyOptional({
    description: 'Write off against a project. Exactly one of projectId or amcId.',
  })
  @ValidateIf((o: CreateWriteOffDto) => !o.amcId)
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Write off against a paid AMC. Exactly one of projectId or amcId.',
  })
  @ValidateIf((o: CreateWriteOffDto) => !o.projectId)
  @IsString()
  amcId?: string;

  @ApiProperty({ example: '2026-09-05' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Write-off amount in NPR' })
  @IsNumber()
  @Min(0.01)
  amountNpr!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
