// frontend/src/components/TemplatesSyncBlock.tsx
'use client'
import './TemplatesSyncBlock.css'
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
		<div className='sinh'>
			<h2 className='sinh-title'>Шаблоны</h2>
			<p className='sinh-text'>
				Синхронизируйте шаблоны перед началом рассылки
			</p>
			<div className="pattern-button">
				<Space>
					<Button onClick={sync} loading={loading}>
						Синхронизировать шаблоны
					</Button>
				</Space>

			</div>
		</div>
	)
}
