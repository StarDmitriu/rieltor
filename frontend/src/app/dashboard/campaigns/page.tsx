'use client'

import { useEffect, useMemo, useState } from 'react'
import {
	Button,
	message,
	Space,
	Tag,
	Segmented,
	Popover,
	TimePicker,
} from 'antd'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'
import dayjs from 'dayjs'
import './page.css'

type ActiveAllResp =
	| {
			success: true
			wa: null | { campaignId: string }
			tg: null | { campaignId: string }
	  }
	| { success: false; message: string; error?: any }

const LS_KEY = 'campaigns_time_window_v2'

function safeParse(v: string | null) {
	try {
		return v ? JSON.parse(v) : null
	} catch {
		return null
	}
}

function normalizeTime(s: any, fallback: string) {
	const str = String(s || '').trim()
	const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(str)
	return m ? `${m[1]}:${m[2]}` : fallback
}

function readSavedWindow(): { timeFrom: string; timeTo: string } {
	const saved = safeParse(localStorage.getItem(LS_KEY))
	return {
		timeFrom: normalizeTime(saved?.timeFrom, '00:00'),
		timeTo: normalizeTime(saved?.timeTo, '23:59'),
	}
}

export default function CampaignsHomePage() {
	const router = useRouter()
	const [loading, setLoading] = useState(false)

	const [waCampaignId, setWaCampaignId] = useState<string>('')
	const [tgCampaignId, setTgCampaignId] = useState<string>('')

	const [startMode, setStartMode] = useState<'both' | 'wa' | 'tg'>('both')

	// ✅ ВАЖНО: на первом рендере ставим ДЕФОЛТ (чтобы совпало с SSR)
	const [{ timeFrom, timeTo }, setTimeWindow] = useState({
		timeFrom: '00:00',
		timeTo: '23:59',
	})

	// ✅ флаг, что мы уже на клиенте (после mount)
	const [mounted, setMounted] = useState(false)

	const [timeOpen, setTimeOpen] = useState(false)

	// ✅ после mount читаем localStorage и применяем (один раз)
	useEffect(() => {
		setMounted(true)
		try {
			const saved = readSavedWindow()
			setTimeWindow(saved)
		} catch {
			// ignore
		}
	}, [])

	// ✅ сохраняем любые изменения (только когда уже mounted)
	useEffect(() => {
		if (!mounted) return
		try {
			localStorage.setItem(LS_KEY, JSON.stringify({ timeFrom, timeTo }))
		} catch {
			// ignore
		}
	}, [mounted, timeFrom, timeTo])

	const loadActive = async () => {
		try {
			const json: ActiveAllResp = await apiGet(`/campaigns/active`)
			if (!json.success) {
				message.error(`Ошибка active: ${json.message}`)
				return;			}
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

	const basePayload = useMemo(
		() => ({
			timeFrom,
			timeTo,
			betweenGroupsSecMin: 126,
			betweenGroupsSecMax: 400,
			betweenTemplatesMinMin: 5,
			betweenTemplatesMinMax: 15,
			repeatEnabled: true,
			repeatMinMin: 5,
			repeatMinMax: 15,
		}),
		[timeFrom, timeTo]
	)

	const progressUrl = useMemo(() => {
		const qs = new URLSearchParams()
		if (waCampaignId) qs.set('wa', waCampaignId)
		if (tgCampaignId) qs.set('tg', tgCampaignId)
		const q = qs.toString()
		return q ? `/dashboard/campaign?${q}` : ''
	}, [waCampaignId, tgCampaignId])

	const startOne = async (channel: 'wa' | 'tg') => {
		const data: any = await apiPost('/campaigns/start-multi', {
			...basePayload,
			channel,
		})

		if (!data?.success) throw new Error(data?.message || 'start_failed')

		const cid = String(data.campaignId || '').trim()
		if (!cid) throw new Error('campaignId_empty')

		return { cid, alreadyRunning: !!data.alreadyRunning }
	}

	const startSelected = async () => {
		// ✅ перед стартом сохраним текущее окно (если можем)
		if (mounted) {
			try {
				localStorage.setItem(LS_KEY, JSON.stringify({ timeFrom, timeTo }))
			} catch {
				// ignore
			}
		}

		setLoading(true)
		try {
			if (startMode === 'wa') {
				const wa = await startOne('wa')
				setWaCampaignId(wa.cid)
				message.success(wa.alreadyRunning ? 'WA уже запущена' : 'WA запущена')
				return;			}

			if (startMode === 'tg') {
				const tg = await startOne('tg')
				setTgCampaignId(tg.cid)
				message.success(tg.alreadyRunning ? 'TG уже запущена' : 'TG запущена')
				return;			}

			const wa = await startOne('wa')
			const tg = await startOne('tg')

			setWaCampaignId(wa.cid)
			setTgCampaignId(tg.cid)

			message.success('Запущены WA + TG')
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

	const timePickerContent = (
		<div style={{ width: 280 }}>
			<div style={{ fontWeight: 600, marginBottom: 8 }}>Время отправки</div>

			<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
				<div style={{ width: 30, opacity: 0.8 }}>с</div>
				<TimePicker
					format='HH:mm'
					minuteStep={1}
					allowClear={false}
					value={dayjs(timeFrom, 'HH:mm')}
					onChange={v =>
						setTimeWindow(prev => ({
							...prev,
							timeFrom: v ? v.format('HH:mm') : '00:00',
						}))
					}
					style={{ flex: 1 }}
				/>
			</div>

			<div style={{ height: 8 }} />

			<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
				<div style={{ width: 30, opacity: 0.8 }}>до</div>
				<TimePicker
					format='HH:mm'
					minuteStep={1}
					allowClear={false}
					value={dayjs(timeTo, 'HH:mm')}
					onChange={v =>
						setTimeWindow(prev => ({
							...prev,
							timeTo: v ? v.format('HH:mm') : '23:59',
						}))
					}
					style={{ flex: 1 }}
				/>
			</div>

			<div
				style={{
					marginTop: 10,
					display: 'flex',
					gap: 8,
					justifyContent: 'flex-end',
				}}
			>
				<Button
					size='small'
					onClick={() => setTimeWindow({ timeFrom: '00:00', timeTo: '23:59' })}
				>
					Сброс
				</Button>
				<Button size='small' type='primary' onClick={() => setTimeOpen(false)}>
					Готово
				</Button>
			</div>

			<div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
				Текущее: {timeFrom} — {timeTo}
			</div>
		</div>
	)

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
					className='campaigns-segmented'
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

				<Popover
					open={timeOpen}
					onOpenChange={setTimeOpen}
					content={timePickerContent}
					trigger='click'
					placement='bottomLeft'
				>
					{/* ✅ чтобы не было hydration warning на тексте времени */}
					<Button>
						Время отправки:{' '}
						<span suppressHydrationWarning>
							<b>{mounted ? timeFrom : '00:00'}</b> —{' '}
							<b>{mounted ? timeTo : '23:59'}</b>
						</span>
					</Button>
				</Popover>

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

			{progressUrl ? (
				<div style={{ marginTop: 16 }}>
					<div style={{ fontWeight: 600, marginBottom: 8 }}>
						Прогресс рассылки
					</div>
					<iframe
						src={progressUrl}
						style={{
							width: '100%',
							height: 900,
							border: '1px solid #e0e0e0',
							borderRadius: 12,
							background: '#fff',
						}}
					/>
				</div>
			) : null}
		</div>
	)
}
