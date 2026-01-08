'use client'

import { Button, Space } from 'antd'
import { useRouter } from 'next/navigation'
import './CampaignBlock.css'

export function CampaignBlock() {
	const router = useRouter()

	return (
		<div className='newsletters'>
			<h2 className='newsletters-title'>Рассылка почти готова!</h2>
			<p className='newsletters-text'>
				Сообщение будет отправлено в выбранные вами группы. Рассылка имитирует
				поведение живого пользователя
			</p>
			<div className="newsletters-button">
				<Space>
					<Button
						type='primary'
						onClick={() => router.push('/dashboard/campaigns')}
					>
						Перейти в рассылки
					</Button>
				</Space>
			</div>
		</div>
	)
}
