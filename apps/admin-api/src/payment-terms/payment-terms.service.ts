import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreatePaymentTermDto, PaymentTermRuleDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';

@Injectable()
export class PaymentTermsService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/payment-terms`, token);
  }

  findOne(distributorId: string, id: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/payment-terms/${id}`, token);
  }

  create(distributorId: string, dto: CreatePaymentTermDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/payment-terms`, token, dto);
  }

  preview(distributorId: string, dto: PaymentTermRuleDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/payment-terms/preview`, token, dto);
  }

  update(distributorId: string, id: string, dto: UpdatePaymentTermDto, token: string) {
    return this.api.patch(`/distributors/${distributorId}/payment-terms/${id}`, token, dto);
  }

  deactivate(distributorId: string, id: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/payment-terms/${id}`, token);
  }
}
