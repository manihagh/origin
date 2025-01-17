import mandrill from 'mandrill-api/mandrill';

import { IEmailAdapter } from './IEmailAdapter';
import { IEmail, IEmailResponse } from '../services/email.service';

export class MandrillEmailAdapter implements IEmailAdapter {
    private mandrill;

    constructor(private apiKey: string) {
        this.mandrill = new mandrill.Mandrill(apiKey);
    }

    public async send(from: string, email: IEmail): Promise<IEmailResponse> {
        const { to, subject, html } = email;

        const toFormatted = to.map((toAddress: string) => {
            return {
                email: toAddress,
                name: toAddress,
                type: 'to'
            };
        });

        const message = {
            html,
            subject,
            from_email: from,
            from_name: 'Energy Web Origin',
            to: toFormatted,
            headers: {
                'Reply-To': process.env.EMAIL_REPLY_TO
            },
            merge: true,
            tags: ['origin', 'no-reply']
        };

        const result = await this.sendMandrill(message);

        return {
            success: result[0].status === 'sent',
            error: result[0].reject_reason ? `Mandrill Error: ${JSON.stringify(result[0])}` : null
        };
    }

    private sendMandrill(message) {
        return new Promise((resolve, reject) => {
            this.mandrill.messages.send(
                {
                    key: this.apiKey,
                    message,
                    async: true,
                    ip_pool: 'Main Pool'
                },
                resolve,
                reject
            );
        });
    }
}
