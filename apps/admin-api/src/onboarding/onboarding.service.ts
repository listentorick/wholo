import { Injectable } from '@nestjs/common';
import type { DistributorOrganisation } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateDistributorDto } from './dto/create-distributor.dto';

@Injectable()
export class OnboardingService {
  constructor(private api: ApiClientService) {}

  createDistributor(bearerToken: string, dto: CreateDistributorDto): Promise<DistributorOrganisation> {
    return this.api.post<DistributorOrganisation>('/distributors', bearerToken, dto);
  }
}
