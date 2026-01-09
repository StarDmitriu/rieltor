'use client'

import { useEffect, useMemo, useState } from 'react'
import Cookies from 'js-cookie'
import { useRouter } from 'next/navigation'

const backendUrl =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

type Sub = {
	user_id: string
	status: string
	plan_code?: string | null
	trial_ends_at?: string | null
	current_period_end?: string | null
	cancel_at_period_end?: boolean | null
	updated_at?: string | null
} | null

type UserRow = {
	id: string
	phone: string
	full_name?: string | null
	gender?: string | null
	telegram?: string | null
	birthday?: string | null
	email?: string | null
	email_verified?: boolean | null
	is_blocked?: boolean | null
	is_admin?: boolean | null
	created_at?: string | null
	last_login?: string | null
	subscription?: Sub
}

function fmtDate(s?: string | null) {
	if (!s) return '—'
	try {
		return new Date(s).toLocaleString()
	} catch {
		return String(s)
	}
}

function daysLeftByEnd(end?: string | null) {
	if (!end) return 0
	const ms = new Date(end).getTime() - Date.now()
	return Math.max(0, Math.ceil(ms / 86400000))
}

function calcTrialDaysLeft(sub: any) {
	return daysLeftByEnd(sub?.trial_ends_at)
}

function calcPaidDaysLeft(sub: any) {
	return daysLeftByEnd(sub?.current_period_end)
}

function calcAccessDaysLeft(sub: any) {
	const t = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0
	const p = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : 0
	const mx = Math.max(t, p)
	if (!mx) return 0
	const ms = mx - Date.now()
	return Math.max(0, Math.ceil(ms / 86400000))
}


export default function AdminPage() {
	const router = useRouter()
	const token = Cookies.get('token')

	const [loading, setLoading] = useState(true)
	const [busyId, setBusyId] = useState<string | null>(null)
	const [err, setErr] = useState<string | null>(null)
	const [users, setUsers] = useState<UserRow[]>([])
	const [q, setQ] = useState('')

	useEffect(() => {
		if (!token) {
			router.push('/auth/phone')
			return
		}

		const load = async () => {
			setLoading(true)
			setErr(null)
			try {
				const res = await fetch(`${backendUrl}/admin/users`, {
					headers: { Authorization: `Bearer ${token}` },
					cache: 'no-store',
				})

				// если не админ / токен плохой
				if (!res.ok) {
					const txt = await res.text().catch(() => '')
					setErr(
						res.status === 401 || res.status === 403
							? 'Нет доступа (нужны права администратора)'
							: `Ошибка загрузки: ${res.status} ${txt}`
					)
					setUsers([])
					return
				}

				const json = await res.json()
				if (!json?.success) {
					setErr(json?.message || 'Не удалось загрузить список пользователей')
					setUsers([])
					return
				}

				setUsers(json.users || [])
			} catch (e) {
				console.error(e)
				setErr('Ошибка сети')
				setUsers([])
			} finally {
				setLoading(false)
			}
		}

		load()
	}, [router])

	const filtered = useMemo(() => {
		const s = q.trim().toLowerCase()
		if (!s) return users
		return users.filter(u => {
			return (
				String(u.phone || '')
					.toLowerCase()
					.includes(s) ||
				String(u.full_name || '')
					.toLowerCase()
					.includes(s) ||
				String(u.email || '')
					.toLowerCase()
					.includes(s) ||
				String(u.telegram || '')
					.toLowerCase()
					.includes(s) ||
				String(u.id || '')
					.toLowerCase()
					.includes(s)
			)
		})
	}, [users, q])

	const reload = async () => {
		if (!token) return
		setLoading(true)
		setErr(null)
		try {
			const res = await fetch(`${backendUrl}/admin/users`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			if (!res.ok) {
				const txt = await res.text().catch(() => '')
				setErr(
					res.status === 401 || res.status === 403
						? 'Нет доступа (нужны права администратора)'
						: `Ошибка загрузки: ${res.status} ${txt}`
				)
				setUsers([])
				return
			}
			const json = await res.json()
			if (!json?.success) {
				setErr(json?.message || 'Не удалось загрузить')
				setUsers([])
				return
			}
			setUsers(json.users || [])
		} catch (e) {
			console.error(e)
			setErr('Ошибка сети')
		} finally {
			setLoading(false)
		}
	}

	const post = async (url: string, body: any) => {
		if (!token) throw new Error('no_token')
		const res = await fetch(`${backendUrl}${url}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		})

		const json = await res.json().catch(() => null)
		if (!res.ok) {
			throw new Error(json?.message || `HTTP ${res.status}`)
		}
		if (!json?.success) {
			throw new Error(json?.message || 'request_failed')
		}
		return json
	}

	const toggleBlock = async (u: UserRow) => {
		setBusyId(u.id)
		try {
			await post(`/admin/users/${u.id}/block`, {
				blocked: !u.is_blocked,
			})
			await reload()
		} catch (e: any) {
			console.error(e)
			alert(e?.message || 'Не удалось изменить блокировку')
		} finally {
			setBusyId(null)
		}
	}

	const giveTrial = async (u: UserRow, days: number) => {
		setBusyId(u.id)
		try {
			await post(`/admin/users/${u.id}/grant-trial`, { days })
			await reload()
		} catch (e: any) {
			console.error(e)
			alert(e?.message || 'Не удалось выдать trial')
		} finally {
			setBusyId(null)
		}
	}

	const extendPaid = async (u: UserRow, days: number) => {
		setBusyId(u.id)
		try {
			await post(`/admin/users/${u.id}/grant-access`, { days })
			await reload()
		} catch (e: any) {
			console.error(e)
			alert(e?.message || 'Не удалось продлить подписку')
		} finally {
			setBusyId(null)
		}
	}

  const reduceTrial = async (u: UserRow, days: number) => {
		setBusyId(u.id)
		try {
			await post(`/admin/users/${u.id}/reduce-trial`, { days })
			await reload()
		} catch (e: any) {
			console.error(e)
			alert(e?.message || 'Не удалось уменьшить trial')
		} finally {
			setBusyId(null)
		}
	}

	const reducePaid = async (u: UserRow, days: number) => {
		setBusyId(u.id)
		try {
			await post(`/admin/users/${u.id}/reduce-access`, { days })
			await reload()
		} catch (e: any) {
			console.error(e)
			alert(e?.message || 'Не удалось уменьшить подписку')
		} finally {
			setBusyId(null)
		}
	}



	if (loading) return <div style={{ padding: 24 }}>Загрузка админки...</div>

	if (err) {
		return (
			<div style={{ padding: 24, maxWidth: 900 }}>
				<h1>Админ-панель</h1>
				<p style={{ color: 'red' }}>{err}</p>

				<div style={{ marginTop: 12 }}>
					<button
						onClick={() => router.push('/cabinet')}
						style={{ padding: 10 }}
					>
						Назад в кабинет
					</button>
					<button onClick={reload} style={{ padding: 10, marginLeft: 8 }}>
						Повторить
					</button>
				</div>
			</div>
		)
	}

	return (
		<div style={{ padding: 24 }}>
			<h1>Админ-панель</h1>

			<div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				<input
					value={q}
					onChange={e => setQ(e.target.value)}
					placeholder='Поиск: телефон, имя, email, telegram, id...'
					style={{ padding: 10, minWidth: 320 }}
				/>
				<button onClick={reload} style={{ padding: 10 }}>
					Обновить
				</button>
				<button onClick={() => router.push('/cabinet')} style={{ padding: 10 }}>
					Назад в кабинет
				</button>
			</div>

			<div style={{ marginTop: 16, overflowX: 'auto' }}>
				<table
					style={{
						width: '100%',
						borderCollapse: 'collapse',
						minWidth: 1100,
					}}
				>
					<thead>
						<tr>
							<th style={th}>Пользователь</th>
							<th style={th}>Контакты</th>
							<th style={th}>Подписка</th>
							<th style={th}>Даты</th>
							<th style={th}>Действия</th>
						</tr>
					</thead>

					<tbody>
						{filtered.map(u => {
              const sub =
								(u as any).subscription ||
								(Array.isArray((u as any).subscriptions)
									? (u as any).subscriptions[0]
									: (u as any).subscriptions) ||
								null

							const trialDaysLeft = calcTrialDaysLeft(sub)
							const paidDaysLeft = calcPaidDaysLeft(sub)
							const accessDaysLeft = calcAccessDaysLeft(sub)

							const trialEndsAt = sub?.trial_ends_at || null
							const paidEndsAt = sub?.current_period_end || null

							const status =
								paidDaysLeft > 0
									? 'active'
									: trialDaysLeft > 0
									? 'trial'
									: 'none'

							const accessEndsAt =
								trialEndsAt || paidEndsAt
									? fmtDate(
											new Date(
												Math.max(
													trialEndsAt ? new Date(trialEndsAt).getTime() : 0,
													paidEndsAt ? new Date(paidEndsAt).getTime() : 0
												)
											).toISOString()
									  )
									: '—'


							const isBusy = busyId === u.id

							return (
								<tr key={u.id}>
									<td style={td}>
										<div>
											<div style={{ fontWeight: 700 }}>
												{u.full_name || '—'}
											</div>
											<div style={{ fontSize: 12, opacity: 0.8 }}>
												{u.phone}
												{u.is_admin ? ' • admin' : ''}
												{u.is_blocked ? ' • BLOCKED' : ''}
											</div>
											<div style={{ fontSize: 11, opacity: 0.7 }}>
												id: {u.id}
											</div>
										</div>
									</td>

									<td style={td}>
										<div style={{ fontSize: 13 }}>
											<div>
												<b>Email:</b> {u.email || '—'}{' '}
												{u.email_verified ? '✅' : ''}
											</div>
											<div>
												<b>Telegram:</b> {u.telegram || '—'}
											</div>
											<div>
												<b>Пол:</b>{' '}
												{u.gender === 'm' ? 'м' : u.gender === 'f' ? 'ж' : '—'}
											</div>
											<div>
												<b>ДР:</b> {u.birthday || '—'}
											</div>
										</div>
									</td>

									<td style={td}>
										<div style={{ fontSize: 13 }}>
											<div>
												<b>Статус:</b> {status}
											</div>

											<div style={{ marginTop: 6 }}>
												<b>Trial:</b> {trialDaysLeft} дн. до{' '}
												{trialEndsAt ? fmtDate(trialEndsAt) : '—'}
											</div>

											<div>
												<b>Paid:</b> {paidDaysLeft} дн. до{' '}
												{paidEndsAt ? fmtDate(paidEndsAt) : '—'}
											</div>

											<div style={{ marginTop: 6 }}>
												<b>Всего доступа:</b> {accessDaysLeft} дн. до{' '}
												{accessEndsAt}
											</div>
										</div>
									</td>

									<td style={td}>
										<div style={{ fontSize: 13 }}>
											<div>
												<b>Создан:</b> {fmtDate(u.created_at)}
											</div>
											<div>
												<b>Вход:</b> {fmtDate(u.last_login)}
											</div>
										</div>
									</td>

									<td style={td}>
										<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
											<button
												onClick={() => toggleBlock(u)}
												disabled={isBusy}
												style={btn}
											>
												{u.is_blocked ? 'Разблок' : 'Блок'}
											</button>

											<button
												onClick={() => giveTrial(u, 3)}
												disabled={isBusy}
												style={btn}
											>
												Trial +3д
											</button>
											<button
												onClick={() => giveTrial(u, 7)}
												disabled={isBusy}
												style={btn}
											>
												Trial +7д
											</button>
											<button
												onClick={() => giveTrial(u, 14)}
												disabled={isBusy}
												style={btn}
											>
												Trial +14д
											</button>

											<button
												onClick={() => extendPaid(u, 30)}
												disabled={isBusy}
												style={btn}
											>
												Paid +30д
											</button>
										</div>
										<button onClick={() => reduceTrial(u, 1)}>Trial -1д</button>
										<button onClick={() => reduceTrial(u, 3)}>Trial -3д</button>

										<button onClick={() => reducePaid(u, 1)}>Paid -1д</button>
										<button onClick={() => reducePaid(u, 7)}>Paid -7д</button>

										{isBusy ? (
											<div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>
												Обновляем...
											</div>
										) : null}
									</td>
								</tr>
							)
						})}

						{filtered.length === 0 ? (
							<tr>
								<td style={td} colSpan={5}>
									Ничего не найдено
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>
		</div>
	)
}

const th: React.CSSProperties = {
	textAlign: 'left',
	padding: 12,
	borderBottom: '1px solid #e0e0e0',
	whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
	verticalAlign: 'top',
	padding: 12,
	borderBottom: '1px solid #f0f0f0',
}

const btn: React.CSSProperties = {
	padding: '8px 10px',
	borderRadius: 8,
	border: '1px solid #ccc',
	background: '#f5f5f5',
	cursor: 'pointer',
}
