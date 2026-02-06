'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Cookies from 'js-cookie'
import {
	Form,
	Input,
	InputNumber,
	Switch,
	message,
	Upload,
	Popconfirm,
	Segmented,
	Select,
	Table,
} from 'antd'
import type { UploadProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useParams, useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'
import Image from 'next/image'
import './page.css'

const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

type TemplateRow = {
	id: string
	enabled: boolean
	order: number
	title: string | null
	text: string | null
	media_url: string | null
}

type GroupRow = {
	jid: string
	title: string | null
	participants_count: number | null
	is_restricted?: boolean | null
	updated_at: string
	send_time?: string | null
}

const SEND_INTERVAL_OPTIONS = [
	{ value: '2-5m', label: '2-5 минут' },
	{ value: '5-15m', label: '5-15 минут' },
	{ value: '15-30m', label: '15-30 минут' },
	{ value: '30-60m', label: '30-60 минут' },
	{ value: '1-2h', label: '1-2 часа' },
	{ value: '2-4h', label: '2-4 часа' },
	{ value: '6h', label: 'раз в 6 часов' },
	{ value: '6-12h', label: '6-12 часов' },
	{ value: '12h', label: 'раз в 12 часов' },
	{ value: '24h', label: 'раз в 24 часа' },
]

export default function TemplateEditPage() {
	const router = useRouter()
	const params = useParams()
	const templateId = String((params as any)?.templateId || '')

	const [userId, setUserId] = useState('')
	const [loadingMe, setLoadingMe] = useState(false)
	const [loadingTpl, setLoadingTpl] = useState(false)
	const [saving, setSaving] = useState(false)
	const [uploading, setUploading] = useState(false)

	const [mediaUrl, setMediaUrl] = useState<string | null>(null)
	const [form] = Form.useForm()

	const [channel, setChannel] = useState<'wa' | 'tg'>('wa')
	const [groups, setGroups] = useState<GroupRow[]>([])
	const [selectedGroupJids, setSelectedGroupJids] = useState<string[]>([])
	const [savingGroups, setSavingGroups] = useState(false)
	const [savingTimeMap, setSavingTimeMap] = useState<Record<string, boolean>>({})
	const groupsReqRef = useRef(0)
	const targetsReqRef = useRef(0)

	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		if (!token) {
			router.push('/auth/phone')
			return;		}
		setLoadingMe(true)
		try {
			const res = await fetch(`${BACKEND_URL}/auth/me`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			const json = await res.json()
			if (!json?.success) {
				Cookies.remove('token')
				router.push('/auth/phone')
				return;			}
			setUserId(String(json.user.id))
		} catch (e) {
			console.error(e)
			message.error('Не удалось получить пользователя')
		} finally {
			setLoadingMe(false)
		}
	}

	const loadGroups = async (uid: string, ch: 'wa' | 'tg') => {
		const reqId = ++groupsReqRef.current
		const url =
			ch === 'tg'
				? `${BACKEND_URL}/telegram/groups/${uid}`
				: `${BACKEND_URL}/whatsapp/groups/${uid}`

		try {
			const res = await fetch(url, {
				cache: 'no-store',
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			})
			const json = await res.json()
			if (reqId !== groupsReqRef.current) return

			if (!json?.success) {
				message.error('Не удалось загрузить группы')
				setGroups([])
				return;			}

			if (ch === 'tg') {
				const selectedOnly = (json.groups || []).filter(
					(g: any) => g.is_selected !== false
				)

				setGroups(
					selectedOnly.map((g: any) => ({
						jid: String(g.tg_chat_id),
						title: g.title ?? null,
						participants_count: g.participants_count ?? null,
						is_restricted: false,
						updated_at: g.updated_at,
						send_time: g.send_time ?? null,
					}))
				)
			} else {
				const usable = (json.groups || []).filter((g: any) => !g.is_announcement)
				setGroups(
					usable.map((g: any) => ({
						jid: String(g.wa_group_id),
						title: g.subject ?? null,
						participants_count: g.participants_count ?? null,
						is_restricted: g.is_restricted ?? false,
						updated_at: g.updated_at,
						send_time: g.send_time ?? null,
					}))
				)
			}
		} catch (e) {
			if (reqId !== groupsReqRef.current) return
			console.error(e)
			message.error('Ошибка сети при загрузке групп')
			setGroups([])
		}
	}

	const loadTargets = async (uid: string, ch: 'wa' | 'tg') => {
		const reqId = ++targetsReqRef.current
		try {
			const json: any = await apiGet(
				`/templates/targets/${uid}/${templateId}/${ch}`
			)
			if (reqId !== targetsReqRef.current) return
			if (!json?.success) {
				message.error('Не удалось загрузить выбранные группы')
				setSelectedGroupJids([])
				return;			}
			setSelectedGroupJids((json.groupJids || []).map((x: any) => String(x)))
		} catch (e) {
			if (reqId !== targetsReqRef.current) return
			console.error(e)
			message.error('Ошибка сети при загрузке выбранных групп')
			setSelectedGroupJids([])
		}
	}

	const saveGroups = async () => {
		if (!userId) return message.error('Нет userId')
		setSavingGroups(true)
		try {
			const json: any = await apiPost('/templates/targets/set', {
				userId,
				templateId,
				groupJids: selectedGroupJids,
				channel,
			})
			if (!json?.success) {
				message.error(`Ошибка сохранения групп: ${json?.message || 'unknown'}`)
				return;			}
			message.success(
				`Группы сохранены (${channel}): ${
					json.count ?? selectedGroupJids.length
				}`
			)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении групп')
		} finally {
			setSavingGroups(false)
		}
	}

	async function setGroupSendTime(
		ch: 'wa' | 'tg',
		jid: string,
		next: string | null
	) {
		const key = `${ch}:${jid}`
		setSavingTimeMap(prev => ({ ...prev, [key]: true }))

		setGroups(prev =>
			prev.map(r => (r.jid === jid ? { ...r, send_time: next } : r))
		)

		try {
			const url =
				ch === 'wa' ? '/whatsapp/groups/time' : '/telegram/groups/time'
			const body =
				ch === 'wa'
					? { userId, wa_group_id: jid, send_time: next }
					: { userId, tg_chat_id: jid, send_time: next }

			const json: any = await apiPost(url, body)
			if (!json?.success) {
				message.error(
					`Не удалось сохранить интервал группы: ${json?.message || 'unknown'}`
				)
			}
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении интервала группы')
		} finally {
			setSavingTimeMap(prev => ({ ...prev, [key]: false }))
		}
	}

	const loadTemplate = async () => {
		if (!templateId) return
		setLoadingTpl(true)
		try {
			const json: any = await apiGet(`/templates/get/${templateId}`)
			if (!json?.success) {
				message.error(`Ошибка загрузки: ${json?.message || 'unknown'}`)
				return;			}

			const tpl: TemplateRow = json.template
			form.setFieldsValue({
				title: tpl.title || '',
				text: tpl.text || '',
				enabled: tpl.enabled ?? true,
				order: tpl.order ?? 1,
			})
			setMediaUrl(tpl.media_url || null)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке шаблона')
		} finally {
			setLoadingTpl(false)
		}
	}

	useEffect(() => {
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (templateId) loadTemplate()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [templateId])

	useEffect(() => {
		if (!userId || !templateId) return
		loadGroups(userId, channel)
		loadTargets(userId, channel)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId, templateId, channel])

	const groupColumns: ColumnsType<GroupRow> = useMemo(() => {
		const cols: ColumnsType<GroupRow> = [
			{
				title: 'Название',
				dataIndex: 'title',
				key: 'title',
				render: (v: any) =>
					v || <span style={{ opacity: 0.6 }}>без названия</span>,
			},
		]

		if (channel === 'tg') {
			cols.push({
				title: 'Интервал',
				key: 'send_time',
				width: 200,
				render: (_: any, row: GroupRow) => (
					<Select
						allowClear
						placeholder='Интервал'
						size='small'
						style={{ width: 170 }}
						value={row.send_time ?? undefined}
						options={SEND_INTERVAL_OPTIONS}
						disabled={!!savingTimeMap[channel + ':' + row.jid]}
						onChange={v => setGroupSendTime(channel, row.jid, v ?? null)}
					/>
				),
			})
		}

		cols.push({
			title: 'Участники',
			dataIndex: 'participants_count',
			key: 'participants_count',
			width: 120,
			render: (v: any) => (typeof v === 'number' ? v : '-'),
		})

		return cols
	}, [channel, savingTimeMap, setGroupSendTime])

	const uploadProps: UploadProps = useMemo(
		() => ({
			maxCount: 1,
			beforeUpload: async file => {
				if (!userId) {
					message.error('Нет userId')
					return Upload.LIST_IGNORE
				}

				setUploading(true)
				try {
					const fd = new FormData()
					fd.append('userId', userId)
					fd.append('file', file)

					const res = await fetch(`${BACKEND_URL}/templates/upload-media`, {
						method: 'POST',
						headers: {
							...(token ? { Authorization: `Bearer ${token}` } : {}),
						},
						body: fd,
					})

					const json = await res.json()
					if (!json?.success) {
						message.error(
							`Ошибка загрузки файла: ${json?.message || 'unknown'}`
						)
						return Upload.LIST_IGNORE
					}

					const url = String(json.publicUrl || json.url || '')
					if (!url) {
						message.error('Не пришла ссылка на файл от сервера')
						return Upload.LIST_IGNORE
					}

					setMediaUrl(url)
					message.success('Файл загружен')
				} catch (e) {
					console.error(e)
					message.error('Ошибка сети при загрузке файла')
				} finally {
					setUploading(false)
				}

				return Upload.LIST_IGNORE
			},
		}),
		[userId, token]
	)

	const onSave = async (values: any) => {
		if (!userId) return message.error('Нет userId')
		if (!templateId) return message.error('Нет templateId')

		setSaving(true)
		try {
			const payload = {
				userId,
				templateId,
				title: values.title,
				text: values.text,
				media_url: mediaUrl,
				enabled: values.enabled ?? true,
				order: values.order ?? 1,
			}

			const json: any = await apiPost('/templates/update', payload)
			if (!json?.success) {
				message.error(`Ошибка сохранения: ${json?.message || 'unknown'}`)
				return;			}

			message.success('Шаблон сохранен')
			router.push('/dashboard/templates')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении шаблона')
		} finally {
			setSaving(false)
		}
	}

	const onDelete = async () => {
		if (!userId) return message.error('Нет userId')
		if (!templateId) return message.error('Нет templateId')

		setSaving(true)
		try {
			const json: any = await apiPost('/templates/delete', {
				userId,
				templateId,
			})
			if (!json?.success) {
				message.error(`Ошибка удаления: ${json?.message || 'unknown'}`)
				return;			}
			message.success('Шаблон удален')
			router.push('/dashboard/templates')
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при удалении шаблона')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className='tedit'>
			<div className='tedit__wrap'>
				<h1 className='tedit__title'>Редактирование шаблона</h1>

				<Form
					className='tedit__form'
					form={form}
					layout='vertical'
					initialValues={{ enabled: true, order: 1 }}
					onFinish={onSave}
				>
					<div className='tedit-cont'>
						<div className='tedit-cont-one'>
							<div className='tedit-field'>
								<div className='tedit-field__label'>Название шаблона</div>
								<Form.Item name='title' style={{ marginBottom: 0 }}>
									<Input
										className='tedit-input'
										placeholder=''
										variant='borderless'
									/>
								</Form.Item>
								<div className='tedit-field__hint'>
									Например: Описание квартиры, Акция, Подбор объектов
								</div>
							</div>

							<div className='tedit-field'>
								<div className='tedit-field__label'>Текст сообщения</div>
								<Form.Item
									name='text'
									style={{ marginBottom: 0 }}
									rules={[
										{
											validator: async (_, value) => {
												const title = form.getFieldValue('title')
												if (
													!String(title || '').trim() &&
													!String(value || '').trim()
												) {
													return Promise.reject(
														new Error('Нужно заполнить title или text')
													)
												}
												return Promise.resolve()
											},
										},
									]}
								>
									<Input.TextArea
										className='tedit-textarea'
										rows={4}
										placeholder=''
										variant='borderless'
									/>
								</Form.Item>
								<div className='tedit-field__hint'>
									Введите текст сообщения. Поддерживается форматирование и эмодзи
								</div>
							</div>

							<div className='tedit-upload'>
								<div className='tedit-upload__label'>Прикрепите изображение</div>

								<div className='tedit-upload__row'>
									<div className='tedit-upload__drop'>
										<Upload {...uploadProps}>
											<button
												type='button'
												className='tedit-upload__btn'
												disabled={!userId || uploading || saving}
											>
												<span className='tedit-upload__icon'>
													<Image
														src='/iconFoto.png'
														alt='Картинка'
														width={19}
														height={19}
													/>
												</span>
												<span>
													Добавьте фото объекта
													<br />
													или промо-картинку
												</span>
											</button>
										</Upload>
									</div>

									<div className='tedit-upload__note'>
										<div className='tedit-upload__noteTitle'>Внимание!</div>
										<div className='tedit-upload__noteText'>
											Можно добавить только 1 изображение
											<br />
											Советуем сделать коллаж из фото
										</div>

										{mediaUrl ? (
											<div className='tedit-upload__current'>
												<div className='tedit-upload__currentLine'>
													Текущий файл:{' '}
													<a href={mediaUrl} target='_blank' rel='noreferrer'>
														открыть
													</a>
												</div>

												<button
													type='button'
													className='tedit-linkbtn'
													onClick={() => setMediaUrl(null)}
													disabled={uploading || saving}
												>
													Убрать
												</button>
											</div>
										) : null}
									</div>
								</div>
							</div>

							<div className='tedit-mini'>
								<div className='tedit-mini__item'>
									<div className='tedit-mini__label'>Включен</div>
									<Form.Item
										name='enabled'
										valuePropName='checked'
										style={{ marginBottom: 0 }}
									>
										<Switch />
									</Form.Item>
								</div>

								<div className='tedit-mini__item'>
									<div className='tedit-mini__label'>Order</div>
									<Form.Item name='order' style={{ marginBottom: 0 }}>
										<InputNumber min={1} />
									</Form.Item>
								</div>
							</div>
						</div>

						<div className='tedit-targets'>
							<div className='tedit-targets__head'>
								<div className='tedit-targets__title'>
									Куда отправлять этот шаблон
								</div>

								<Segmented
									value={channel}
									onChange={v => setChannel(v as any)}
									options={[
										{ label: 'WhatsApp', value: 'wa' },
										{ label: 'Telegram', value: 'tg' },
									]}
								/>
							</div>

							<div className='tedit-targets__meta'>
								Канал: <b>{channel.toUpperCase()}</b> · Выбрано:{' '}
								<b>{selectedGroupJids.length}</b> · Доступно:{' '}
								<b>{groups.length}</b>
							</div>

							<div className='tedit-targets__buttons'>
								<button
									type='button'
									className='tedit-pill'
									onClick={() => setSelectedGroupJids(groups.map(g => g.jid))}
									disabled={!groups.length}
								>
									Выбрать все
								</button>

								<button
									type='button'
									className='tedit-pill'
									onClick={() => setSelectedGroupJids([])}
									disabled={!selectedGroupJids.length}
								>
									Снять все
								</button>

								<button
									type='button'
									className='tedit-pill tedit-pill--primary'
									onClick={saveGroups}
									disabled={savingGroups || saving || uploading || !userId}
								>
									{savingGroups
										? 'Сохраняем...'
										: `Сохранить группы (${channel.toUpperCase()})`}
								</button>
							</div>

							<div className='tedit-table'>
								<Table
									rowKey='jid'
									columns={groupColumns}
									dataSource={groups}
									pagination={{ pageSize: 8 }}
									rowSelection={{
										selectedRowKeys: selectedGroupJids,
										onChange: keys =>
											setSelectedGroupJids(keys as string[]),
									}}
								/>
							</div>

							<div className='tedit-targets__hint'>
								Выбор сохранится после нажатия «Сохранить группы».
							</div>
						</div>
					</div>

					<div className='tedit-actions'>
						<button
							className='tedit-btn tedit-btn--primary'
							type='submit'
							disabled={saving || uploading || loadingMe || loadingTpl}
						>
							{saving ? 'Сохраняем...' : 'Сохранить шаблон'}
						</button>

						<button
							className='tedit-btn'
							type='button'
							onClick={() => router.push('/dashboard/templates')}
							disabled={saving}
						>
							Назад
						</button>

						<Popconfirm
							title='Удалить шаблон?'
							okText='Удалить'
							cancelText='Отмена'
							onConfirm={onDelete}
						>
							<button
								type='button'
								className='tedit-btn tedit-btn--danger'
								disabled={saving || uploading}
							>
								Удалить
							</button>
						</Popconfirm>
					</div>

					{loadingTpl ? (
						<div style={{ marginTop: 10, opacity: 0.75, textAlign: 'center' }}>
							Загрузка...
						</div>
					) : null}
				</Form>
			</div>
		</div>
	)
}
