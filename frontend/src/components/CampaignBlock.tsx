'use client'

import { Button, Space } from 'antd'
import { useRouter } from 'next/navigation'

export function CampaignBlock() {
	const router = useRouter()

	return (
		<div
			style={{
				border: '1px solid #eee',
				borderRadius: 12,
				padding: 16,
				marginTop: 16,
			}}
		>
			<h3 style={{ marginTop: 0 }}>Рассылка</h3>
			<Space>
				<Button
					type='primary'
					onClick={() => router.push('/dashboard/campaigns')}
				>
					Перейти в рассылки
				</Button>
			</Space>
		</div>
	)
}
