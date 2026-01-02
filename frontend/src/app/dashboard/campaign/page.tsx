'use client'
//frontend/src/app/dashboard/campaign/page.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, message, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiGet, apiPost } from '@/lib/api'

type Job = {
	id: string
	group_jid: string
	template_id: string
	status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'
	scheduled_at: string
	sent_at: string | null
	error: string | null
}

type ProgressResponse =
	| {
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

export default function CampaignPage() {
	const router = useRouter()
	const sp = useSearchParams()
	const campaignId = (sp.get('campaignId') || '').trim()

	const [loading, setLoading] = useState(false)
	const [data, setData] = useState<ProgressResponse | null>(null)

	const POLL_MS = 5000
	const timerRef = useRef<number | null>(null)

	const stopPolling = () => {
		if (timerRef.current) {
			window.clearInterval(timerRef.current)
			timerRef.current = null
		}
	}

	const startPolling = () => {
		stopPolling()
		timerRef.current = window.setInterval(load, POLL_MS)
	}

	const load = async () => {
		if (!campaignId) return
		setLoading(true)
		try {
			const json: ProgressResponse = await apiGet(
				`/campaigns/${campaignId}/progress`
			)
			setData(json)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке прогресса')
		} finally {
			setLoading(false)
		}
	}

	const stopCampaign = async () => {
		if (!campaignId) return
		try {
			const json: any = await apiPost(`/campaigns/${campaignId}/stop`)
			if (!json?.success) {
				const extra = pickErrorText(json)
				message.error(
					`Stop ошибка: ${json?.message || 'unknown'}${
						extra ? ` (${extra})` : ''
					}`
				)
				return
			}
			message.success('Рассылка остановлена')
			await load()
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при stop')
		}
	}

	useEffect(() => {
		if (!campaignId) return
		load()
		startPolling()
		return () => stopPolling()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [campaignId])

	const summary = useMemo(() => {
		if (!data || !(data as any).success) return null
		const d: any = data
		return (
			<div style={{ marginBottom: 12 }}>
				<div>total: {d.total}</div>
				<div>sent: {d.sent}</div>
				<div>failed: {d.failed}</div>
				<div>pending: {d.pending}</div>
				<div>processing: {d.processing}</div>
				<div>skipped: {d.skipped}</div>
				<div style={{ marginTop: 6 }}>
					Статус:{' '}
					{d.done ? (
						<Tag color='green'>done</Tag>
					) : (
						<Tag color='blue'>running</Tag>
					)}
				</div>
			</div>
		)
	}, [data])

	const columns: ColumnsType<Job> = [
		{ title: 'Group', dataIndex: 'group_jid', key: 'group_jid' },
		{ title: 'Template', dataIndex: 'template_id', key: 'template_id' },
		{
			title: 'Status',
			dataIndex: 'status',
			key: 'status',
			render: (v: Job['status']) => {
				if (v === 'sent') return <Tag color='green'>sent</Tag>
				if (v === 'failed') return <Tag color='red'>failed</Tag>
				if (v === 'processing') return <Tag color='blue'>processing</Tag>
				if (v === 'skipped') return <Tag>skipped</Tag>
				return <Tag color='gold'>pending</Tag>
			},
		},
		{
			title: 'Scheduled',
			dataIndex: 'scheduled_at',
			key: 'scheduled_at',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
		},
		{
			title: 'SentAt',
			dataIndex: 'sent_at',
			key: 'sent_at',
			render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—'),
		},
	]

	if (!campaignId) {
		return (
			<div style={{ padding: 24, color: 'crimson' }}>
				campaignId не передан в URL
			</div>
		)
	}

	return (
		<div style={{ padding: 24 }}>
			<h1>Прогресс рассылки</h1>

			<div style={{ marginBottom: 12 }}>
				<div style={{ marginBottom: 8 }}>
					campaignId: <code>{campaignId}</code>
				</div>

				<Space wrap>
					<Button onClick={load} loading={loading}>
						Обновить
					</Button>

					<Button danger onClick={stopCampaign}>
						Остановить рассылку
					</Button>

					<Button onClick={() => router.push('/dashboard/campaigns')}>
						Назад
					</Button>
				</Space>
			</div>

			{data && !(data as any).success ? (
				<div style={{ color: 'crimson' }}>
					Ошибка: {(data as any).message || 'unknown'}
					{pickErrorText(data) ? ` — ${pickErrorText(data)}` : ''}
				</div>
			) : null}

			{summary}

			<Table
				rowKey='id'
				columns={columns}
				dataSource={(data as any)?.success ? (data as any).jobs : []}
				loading={loading}
				pagination={{ pageSize: 10 }}
			/>
		</div>
	)
}
