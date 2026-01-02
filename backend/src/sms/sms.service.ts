// backend/src/sms/sms.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiId = process.env.SMSRU_API_ID;
  private readonly from = process.env.SMSRU_FROM; // можно не заполнять

  async sendSms(phone: string, text: string) {
    if (!this.apiId) {
      this.logger.warn(
        `SMSRU_API_ID не задан, SMS не отправляем. Сообщение: "${text}" для ${phone}`,
      );
      return { success: false, reason: 'no_api_id' };
    }

    /*try {
      const params: any = {
        api_id: this.apiId,
        to: phone, // пример: 79991234567 (без +)
        msg: text,
        json: 1,
      };

      if (this.from) {
        params.from = this.from;
      }

      const res = await axios.get('https://sms.ru/sms/send', { params });
      const data = res.data;

      this.logger.log(`sms.ru response for ${phone}: ${JSON.stringify(data)}`);

      if (data.status !== 'OK') {
        return { success: false, data };
      }

      return { success: true, data };
    } catch (error) {
      this.logger.error('Ошибка при отправке SMS', error as any);
      return { success: false, error };
    }*/
  }
}
