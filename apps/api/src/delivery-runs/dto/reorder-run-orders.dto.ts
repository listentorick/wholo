import {
  ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, Min,
} from 'class-validator';

export class ReorderRunOrdersDto {
  @IsInt()
  @Min(0)
  version: number;

  // Full ordered set of the run's currently-active orderIds — exact-match
  // validated in the service, same pattern as ReorderRouteCustomersDto.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  orderedOrderIds: string[];
}
