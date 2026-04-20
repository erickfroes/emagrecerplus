import { IsOptional, IsString } from "class-validator";

export class MarkNoShowDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
