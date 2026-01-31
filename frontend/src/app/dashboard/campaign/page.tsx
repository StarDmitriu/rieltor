//frontend/src/app/dashboard/campaign/page.tsx
'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, message, Space, Table, Tag, Typography, Divider } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiGet, apiPost } from '@/lib/api'

const { Title } = Typography

type Job = {
	id: string
	group_jid: string
	template_id: string
	status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'
	scheduled_at: string
	sent_at: string | null
	error: string | null
}

type ProgressOk = {
	success: true
	campaignId: string
	total: number
	sent: number
	failed: number
	pending: number
	processing: number
	skipped: number
	done: boolean
	jobs: Job[]
}

type ProgressResponse =
	| ProgressOk
	| { success: false; message: string; details?: any; error?: any }

function pickErrorText(obj: any) {
	if (!obj) return ''
	const details =
		obj.details?.message ??
		obj.details?.hint ??
		(typeof obj.details === 'string' ? obj.details : null)

	const err =
		obj.error?.message ??
		obj.error?.hint ??
		(typeof obj.error === 'string' ? obj.error : null)

	return details || err || ''
}

function StatusTag({ done }: { done: boolean }) {
	return done ? (
		<Tag color='green'>завершена</Tag>
	) : (
		<Tag color='blue'>выполняется</Tag>
	)
}

const STATUS_LABELS: Record<Job['status'], { text: string; color?: string }> = {
	sent: { text: 'отправлено', color: 'green' },
	failed: { text: 'ошибка', color: 'red' },
	processing: { text: 'отправляется', color: 'blue' },
	skipped: { text: 'пропущено' },
	pending: { text: 'в ожидании', color: 'gold' },
}

function CampaignInner() {
	const router = useRouter()
	const sp = useSearchParams()

	// ✅ новый контракт: ?wa=...&tg=...
	const waId = (sp.get('wa') || '').trim()
	const tgId = (sp.get('tg') || '').trim()

	// ✅ старый контракт поддержим: ?campaignId=...
	const legacyId = (sp.get('campaignId') || '').trim()

	const effectiveWa = waId || (legacyId ? legacyId : '')
	const effectiveTg = tgId

	const [loading, setLoading] = useState(false)
	const [wa, setWa] = useState<ProgressResponse | null>(null)
	const [tg, setTg] = useState<ProgressResponse | null>(null)
	const [groupMapWa, setGroupMapWa] = useState<Record<string, string>>({})
	const [groupMapTg, setGroupMapTg] = useState<Record<string, string>>({})
	const [templateMap, setTemplateMap] = useState<Record<string, string>>({})

	const POLL_MS = 5000
	const timerRef = useRef<number | null>(null)

	const stopPolling = () => {
		if (timerRef.current) {
			window.clearInterval(timerRef.current)
			timerRef.current = null
		}
	}

	const loadOne = async (cid: string) => {
		const json: ProgressResponse = await apiGet(`/campaigns/${cid}/progress`)
		return json
	}

	const load = async () => {
		if (!effectiveWa && !effectiveTg) return
		setLoading(true)
		try {
			if (effectiveWa) setWa(await loadOne(effectiveWa))
			if (effectiveTg) setTg(await loadOne(effectiveTg))
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке прогресса')
		} finally {
			setLoading(false)
		}
	}

	const loadNames = async () => {
		const me = await apiGet('/auth/me')
		if (!me?.success || !me?.user?.id) return
		const uid = String(me.user.id)

		const [waGroups, tgGroups, templates] = await Promise.all([
			apiGet(`/whatsapp/groups/${uid}`),
			apiGet(`/telegram/groups/${uid}`),
			apiGet(`/templates/list/${uid}`),
		])

		if (waGroups?.success) {
			const map: Record<string, string> = {}
			for (const g of waGroups.groups || []) {
				const id = String(g.wa_group_id || '')
				if (!id) continue
				map[id] = g.subject || id
			}
			setGroupMapWa(map)
		}

		if (tgGroups?.success) {
			const map: Record<string, string> = {}
			for (const g of tgGroups.groups || []) {
				const id = String(g.tg_chat_id || '')
				if (!id) continue
				map[id] = g.title || id
			}
			setGroupMapTg(map)
		}

		if (templates?.success) {
			const map: Record<string, string> = {}
			for (const t of templates.templates || []) {
				const id = String(t.id || '')
				if (!id) continue
				map[id] = t.title || id
			}
			setTemplateMap(map)
		}
	}

	const startPolling = () => {
		stopPolling()
		timerRef.current = window.setInterval(load, POLL_MS)
	}

	const stopCampaign = async (cid: string) => {
		try {
			const json: any = await apiPost(`/campaigns/${cid}/stop`)
			if (!json?.success) {
				const extra = pickErrorText(json)
				message.error(
					`Stop ошибка: ${json?.message || 'unknown'}${
						extra ? ` (${extra})` : ''
					}`
				)
				return;			}
			message.success(`Остановлено: ${cid}`)
			await load()
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при stop')
		}
	}

	useEffect(() => {
		load()
		loadNames()
		startPolling()
		return () => stopPolling()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveWa, effectiveTg])

	const buildColumns = (
		groupMap: Record<string, string>
	): ColumnsType<Job> => [
		{
			title: 'Группа',
			dataIndex: 'group_jid',
			key: 'group_jid',
			render: (v: string) => groupMap[v] || v,
		},
		{
			title: 'Шаблон',
			dataIndex: 'template_id',
			key: 'template_id',
			render: (v: string) => templateMap[v] || v,
		},
		{
			title: 'Статус',
			dataIndex: 'status',
			key: 'status',
			render: (v: Job['status']) => {
				const label = STATUS_LABELS[v]
				return <Tag color={label.color}>{label.text}</Tag>
			},
		},
		{
			title: 'Запланировано',
			dataIndex: 'scheduled_at',
			key: 'scheduled_at',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
		},
		{
			title: 'Отправлено',
			dataIndex: 'sent_at',
			key: 'sent_at',
			render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—'),
		},
	]

	const waSummary = useMemo(() => {
		if (!wa || !(wa as any).success) return null
		const d = wa as ProgressOk
		return (
			<div style={{ marginBottom: 12 }}>
				<div>всего: {d.total}</div>
				<div>отправлено: {d.sent}</div>
				<div>ошибок: {d.failed}</div>
				<div>в ожидании: {d.pending}</div>
				<div>отправляется: {d.processing}</div>
				<div>пропущено: {d.skipped}</div>
				<div style={{ marginTop: 6 }}>
					Статус: <StatusTag done={d.done} />
				</div>
			</div>
		)
	}, [wa])

	const tgSummary = useMemo(() => {
		if (!tg || !(tg as any).success) return null
		const d = tg as ProgressOk
		return (
			<div style={{ marginBottom: 12 }}>
				<div>всего: {d.total}</div>
				<div>отправлено: {d.sent}</div>
				<div>ошибок: {d.failed}</div>
				<div>в ожидании: {d.pending}</div>
				<div>отправляется: {d.processing}</div>
				<div>пропущено: {d.skipped}</div>
				<div style={{ marginTop: 6 }}>
					Статус: <StatusTag done={d.done} />
				</div>
			</div>
		)
	}, [tg])

	if (!effectiveWa && !effectiveTg) {
		return (
			<div style={{ padding: 24, color: 'crimson' }}>
				Не переданы параметры в URL. Ожидаю:
				<div style={{ marginTop: 8 }}>
					<code>?wa=...&tg=...</code> или <code>?wa=...</code> /{' '}
					<code>?tg=...</code>
				</div>
			</div>
		)
	}

	return (
		<div style={{ padding: 24 }}>
			<Title level={3}>Прогресс рассылок</Title>

			<div style={{ marginBottom: 12 }}>
				<Space wrap>
					<Button onClick={load} loading={loading}>
						Обновить
					</Button>

					<Button onClick={() => router.push('/dashboard/campaigns')}>
						Назад
					</Button>
				</Space>
			</div>

			{/* WA */}
			{effectiveWa ? (
				<div style={{ marginBottom: 24 }}>
					<Title level={4}>WhatsApp</Title>
					<div style={{ marginBottom: 8 }}>
						campaignId: <code>{effectiveWa}</code>
					</div>

					<Space wrap style={{ marginBottom: 12 }}>
						<Button danger onClick={() => stopCampaign(effectiveWa)}>
							Остановить WA
						</Button>
					</Space>

					{wa && !(wa as any).success ? (
						<div style={{ color: 'crimson', marginBottom: 12 }}>
							Ошибка: {(wa as any).message || 'unknown'}
							{pickErrorText(wa) ? ` — ${pickErrorText(wa)}` : ''}
						</div>
					) : null}

					{waSummary}

					<Table
						rowKey='id'
						columns={buildColumns(groupMapWa)}
						dataSource={(wa as any)?.success ? (wa as any).jobs : []}
						loading={loading}
						pagination={{ pageSize: 10 }}
					/>
				</div>
			) : null}

			{effectiveWa && effectiveTg ? <Divider /> : null}

			{/* TG */}
			{effectiveTg ? (
				<div>
					<Title level={4}>Telegram</Title>
					<div style={{ marginBottom: 8 }}>
						campaignId: <code>{effectiveTg}</code>
					</div>

					<Space wrap style={{ marginBottom: 12 }}>
						<Button danger onClick={() => stopCampaign(effectiveTg)}>
							Остановить TG
						</Button>
					</Space>

					{tg && !(tg as any).success ? (
						<div style={{ color: 'crimson', marginBottom: 12 }}>
							Ошибка: {(tg as any).message || 'unknown'}
							{pickErrorText(tg) ? ` — ${pickErrorText(tg)}` : ''}
						</div>
					) : null}

					{tgSummary}

					<Table
						rowKey='id'
						columns={buildColumns(groupMapTg)}
						dataSource={(tg as any)?.success ? (tg as any).jobs : []}
						loading={loading}
						pagination={{ pageSize: 10 }}
					/>
				</div>
			) : null}
		</div>
	)
}

export default function CampaignPage() {
	return (
		<Suspense fallback={<div style={{ padding: 24 }}>Загрузка...</div>}>
			<CampaignInner />
		</Suspense>
	)
}
