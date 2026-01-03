import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiId = (process.env.SMSRU_API_ID || '').trim();
  private readonly from = (process.env.SMSRU_FROM || '').trim(); // опционально
  private readonly env = (process.env.NODE_ENV || 'development').trim();

  /**
   * sms.ru send endpoint:
   * https://sms.ru/sms/send?api_id=...&to=...&msg=...&json=1
   */
  async sendSms(phone: string, text: string) {
    // ✅ DEV режим: если нет API ключа — НЕ ломаем логин, просто логируем код
    if (!this.apiId) {
      this.logger.warn(
        `SMSRU_API_ID не задан -> DEV mode: SMS не отправляем. phone=${phone} text="${text}"`,
      );
      return { success: true, dev: true, reason: 'no_api_id' };
    }

    try {
      const params: any = {
        api_id: this.apiId,
        to: phone,
        msg: text,
        json: 1,
      };

      // sender name (если задан)
      if (this.from) {
        params.from = this.from;
      }

      const res = await axios.get('https://sms.ru/sms/send', {
        params,
        timeout: 15_000,
      });

      const data = res.data;

      /**
       * У sms.ru JSON примерно такой:
       * { "status":"OK","status_code":100,"sms":{ "<phone>": {"status":"OK","status_code":100,"sms_id":"..."} } }
       */
      if (!data || data.status !== 'OK') {
        this.logger.warn(`sms.ru error response: ${JSON.stringify(data)}`);
        return { success: false, reason: 'smsru_not_ok', data };
      }

      // иногда удобно проверить status_code=100
      if (data.status_code && Number(data.status_code) !== 100) {
        this.logger.warn(`sms.ru status_code != 100: ${JSON.stringify(data)}`);
        return { success: false, reason: 'smsru_status_code', data };
      }

      this.logger.log(`SMS sent via sms.ru to ${phone}`);
      return { success: true, provider: 'smsru', data };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const resp = e?.response?.data ? JSON.stringify(e.response.data) : null;

      this.logger.error(
        `SMS send failed: ${msg}${resp ? ` resp=${resp}` : ''}`,
      );

      return { success: false, reason: 'smsru_exception', error: msg, resp };
    }
  }
}
