'use client'
//frontend/src/app/dashboard/campaigns/page.tsx
import { useEffect, useState } from 'react'
import { Button, message, Space, Tag } from 'antd'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'

type ActiveResp =
	| { success: true; active: null | { campaignId: string } }
	| { success: false; message: string; error?: any }

export default function CampaignsHomePage() {
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [activeCampaignId, setActiveCampaignId] = useState<string>('')

	const loadActive = async () => {
		try {
			const json: ActiveResp = await apiGet(`/campaigns/active`)
			if (!json.success) {
				message.error(`Ошибка active: ${json.message}`)
				return
			}
			setActiveCampaignId(json.active?.campaignId || '')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при active')
		}
	}

	useEffect(() => {
		loadActive()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const startCampaign = async () => {
		setLoading(true)
		try {
			const data: any = await apiPost('/campaigns/start-multi', {
				// ✅ userId больше не шлём
				timeFrom: '00:00',
				timeTo: '23:59',
				betweenGroupsSecMin: 1,
				betweenGroupsSecMax: 1,
				betweenTemplatesMinMin: 1,
				betweenTemplatesMinMax: 1,
				repeatEnabled: true,
				repeatMinMin: 1,
				repeatMinMax: 1,
			})

			if (!data?.success) {
				message.error(`Ошибка старта: ${data?.message || 'unknown'}`)
				return
			}

			const cid = String(data.campaignId || '').trim()
			if (!cid) {
				message.error('campaignId не пришёл')
				return
			}

			setActiveCampaignId(cid)

			if (data.alreadyRunning) {
				message.info('Кампания уже запущена — открыл текущую')
			} else {
				message.success('Кампания запущена')
			}

			router.push(`/dashboard/campaign?campaignId=${cid}`)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при старте кампании')
		} finally {
			setLoading(false)
		}
	}

	const stopCampaign = async () => {
		if (!activeCampaignId) return

		setLoading(true)
		try {
			const json: any = await apiPost(`/campaigns/${activeCampaignId}/stop`)
			if (!json?.success) {
				message.error(`Ошибка stop: ${json?.message || 'unknown'}`)
				return
			}
			message.success('Рассылка остановлена')
			setActiveCampaignId('')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при stop')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div style={{ padding: 24 }}>
			<h1>Рассылки</h1>

			<div style={{ marginBottom: 12 }}>
				Статус:{' '}
				{activeCampaignId ? (
					<Tag color='blue'>running</Tag>
				) : (
					<Tag>нет активной</Tag>
				)}
			</div>

			<Space wrap>
				<Button type='primary' onClick={startCampaign} loading={loading}>
					Начать рассылку
				</Button>

				<Button
					danger
					disabled={!activeCampaignId}
					onClick={stopCampaign}
					loading={loading}
				>
					Остановить рассылку
				</Button>

				<Button
					disabled={!activeCampaignId}
					onClick={() =>
						router.push(`/dashboard/campaign?campaignId=${activeCampaignId}`)
					}
				>
					Открыть прогресс
				</Button>

				<Button onClick={() => router.push('/cabinet')}>Назад в кабинет</Button>

				<Button onClick={loadActive}>Обновить статус</Button>
			</Space>
		</div>
	)
}
