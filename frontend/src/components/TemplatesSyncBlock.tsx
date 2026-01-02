// frontend/src/components/TemplatesSyncBlock.tsx
'use client'

import { useState } from 'react'
import { Button, message, Space } from 'antd'
import { apiPost } from '@/lib/api'

export function TemplatesSyncBlock({ userId }: { userId: string }) {
	const [loading, setLoading] = useState(false)

	const sync = async () => {
		if (!userId) return message.error('Нет userId')
		setLoading(true)
		try {
			const data: any = await apiPost('/templates/sync', { userId })
			if (!data?.success) {
				message.error(`Ошибка синхронизации: ${data?.message || 'unknown'}`)
				return
			}
			message.success(`Шаблоны синхронизированы: ${data?.count ?? 'ok'}`)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при синхронизации шаблонов')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div
			style={{
				border: '1px solid #eee',
				borderRadius: 12,
				padding: 16,
				marginTop: 16,
			}}
		>
			<h3 style={{ marginTop: 0 }}>Шаблоны</h3>
			<Space>
				<Button onClick={sync} loading={loading}>
					Синхронизировать шаблоны
				</Button>
			</Space>
		</div>
	)
}
