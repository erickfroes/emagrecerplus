import { ArrayUnique, IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class CreateTeamInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  roleCode!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  unitIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
