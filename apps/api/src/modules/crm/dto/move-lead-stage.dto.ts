import { IsString } from "class-validator";

export class MoveLeadStageDto {
  @IsString()
  stageCode!: string;
}
