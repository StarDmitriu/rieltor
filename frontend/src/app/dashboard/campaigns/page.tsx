'use client'

import { useEffect, useState } from 'react'
import { Button, message, Space, Tag, Segmented } from 'antd'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'

type ActiveAllResp =
	| {
			success: true
			wa: null | { campaignId: string }
			tg: null | { campaignId: string }
	  }
	| { success: false; message: string; error?: any }

export default function CampaignsHomePage() {
	const router = useRouter()
	const [loading, setLoading] = useState(false)

	const [waCampaignId, setWaCampaignId] = useState<string>('')
	const [tgCampaignId, setTgCampaignId] = useState<string>('')

	const [startMode, setStartMode] = useState<'both' | 'wa' | 'tg'>('both')

	const loadActive = async () => {
		try {
			const json: ActiveAllResp = await apiGet(`/campaigns/active`)
			if (!json.success) {
				message.error(`Ошибка active: ${json.message}`)
				return
			}
			setWaCampaignId(json.wa?.campaignId || '')
			setTgCampaignId(json.tg?.campaignId || '')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при active')
		}
	}

	useEffect(() => {
		loadActive()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const basePayload = {
		timeFrom: '00:00',
		timeTo: '23:59',
		betweenGroupsSecMin: 1,
		betweenGroupsSecMax: 1,
		betweenTemplatesMinMin: 1,
		betweenTemplatesMinMax: 1,
		repeatEnabled: true,
		repeatMinMin: 1,
		repeatMinMax: 1,
	}

	const startOne = async (channel: 'wa' | 'tg') => {
		const data: any = await apiPost('/campaigns/start-multi', {
			...basePayload,
			channel,
		})

		if (!data?.success) {
			throw new Error(data?.message || 'start_failed')
		}

		const cid = String(data.campaignId || '').trim()
		if (!cid) throw new Error('campaignId_empty')

		return { cid, alreadyRunning: !!data.alreadyRunning }
	}

	const startSelected = async () => {
		setLoading(true)
		try {
			if (startMode === 'wa') {
				const wa = await startOne('wa')
				setWaCampaignId(wa.cid)
				message.success(wa.alreadyRunning ? 'WA уже запущена' : 'WA запущена')
				router.push(`/dashboard/campaign?wa=${wa.cid}`)
				return
			}

			if (startMode === 'tg') {
				const tg = await startOne('tg')
				setTgCampaignId(tg.cid)
				message.success(tg.alreadyRunning ? 'TG уже запущена' : 'TG запущена')
				router.push(`/dashboard/campaign?tg=${tg.cid}`)
				return
			}

			// both
			const wa = await startOne('wa')
			const tg = await startOne('tg')

			setWaCampaignId(wa.cid)
			setTgCampaignId(tg.cid)

			message.success('Запущены WA + TG')
			router.push(`/dashboard/campaign?wa=${wa.cid}&tg=${tg.cid}`)
		} catch (e: any) {
			console.error(e)
			message.error(`Ошибка старта: ${e?.message || 'unknown'}`)
		} finally {
			setLoading(false)
		}
	}

	const stopOne = async (cid: string) => {
		const json: any = await apiPost(`/campaigns/${cid}/stop`)
		if (!json?.success) throw new Error(json?.message || 'stop_failed')
	}

	const stopWa = async () => {
		if (!waCampaignId) return
		setLoading(true)
		try {
			await stopOne(waCampaignId)
			message.success('WA остановлена')
			setWaCampaignId('')
		} catch (e: any) {
			console.error(e)
			message.error(`WA stop: ${e?.message || 'unknown'}`)
		} finally {
			setLoading(false)
		}
	}

	const stopTg = async () => {
		if (!tgCampaignId) return
		setLoading(true)
		try {
			await stopOne(tgCampaignId)
			message.success('TG остановлена')
			setTgCampaignId('')
		} catch (e: any) {
			console.error(e)
			message.error(`TG stop: ${e?.message || 'unknown'}`)
		} finally {
			setLoading(false)
		}
	}

	const openProgress = () => {
		const qs = new URLSearchParams()
		if (waCampaignId) qs.set('wa', waCampaignId)
		if (tgCampaignId) qs.set('tg', tgCampaignId)
		router.push(`/dashboard/campaign?${qs.toString()}`)
	}

	return (
		<div style={{ padding: 24 }}>
			<h1>Рассылки</h1>

			<div style={{ marginBottom: 12 }}>
				<div style={{ marginBottom: 6 }}>
					WA: {waCampaignId ? <Tag color='blue'>running</Tag> : <Tag>нет</Tag>}{' '}
					{waCampaignId ? (
						<code style={{ fontSize: 12 }}>{waCampaignId}</code>
					) : null}
				</div>
				<div>
					TG: {tgCampaignId ? <Tag color='blue'>running</Tag> : <Tag>нет</Tag>}{' '}
					{tgCampaignId ? (
						<code style={{ fontSize: 12 }}>{tgCampaignId}</code>
					) : null}
				</div>
			</div>

			<div style={{ marginBottom: 12 }}>
				<Segmented
					value={startMode}
					onChange={v => setStartMode(v as any)}
					options={[
						{ label: 'WA + TG', value: 'both' },
						{ label: 'Только WA', value: 'wa' },
						{ label: 'Только TG', value: 'tg' },
					]}
				/>
			</div>

			<Space wrap>
				<Button type='primary' onClick={startSelected} loading={loading}>
					Запустить
				</Button>

				<Button
					danger
					disabled={!waCampaignId}
					onClick={stopWa}
					loading={loading}
				>
					Остановить WA
				</Button>

				<Button
					danger
					disabled={!tgCampaignId}
					onClick={stopTg}
					loading={loading}
				>
					Остановить TG
				</Button>

				<Button
					disabled={!waCampaignId && !tgCampaignId}
					onClick={openProgress}
				>
					Открыть прогресс
				</Button>

				<Button onClick={() => router.push('/cabinet')}>Назад в кабинет</Button>

				<Button onClick={loadActive} loading={loading}>
					Обновить статус
				</Button>
			</Space>
		</div>
	)
}
