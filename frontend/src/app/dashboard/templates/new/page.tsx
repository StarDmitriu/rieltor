'use client'

import { useEffect, useMemo, useState } from 'react'
import Cookies from 'js-cookie'
import {
	Button,
	Form,
	Input,
	InputNumber,
	Space,
	Switch,
	message,
	Upload,
	Table,
	Tag,
	Segmented,
	Select,
} from 'antd'
import type { UploadProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UploadOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { apiPost } from '@/lib/api'
import './page.css'
import Image from 'next/image'


const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

type UiGroupRow = {
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

export default function TemplateCreatePage() {
	const router = useRouter()
	const [userId, setUserId] = useState('')
	const [saving, setSaving] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [mediaUrl, setMediaUrl] = useState<string | null>(null)
	const [form] = Form.useForm()

	// ✅ channel + groups
	const [channel, setChannel] = useState<'wa' | 'tg'>('wa')
	const [waGroups, setWaGroups] = useState<UiGroupRow[]>([])
	const [tgGroups, setTgGroups] = useState<UiGroupRow[]>([])

	// ✅ selections per channel
	const [waSelected, setWaSelected] = useState<string[]>([])
	const [tgSelected, setTgSelected] = useState<string[]>([])
	const [savingTargets, setSavingTargets] = useState(false)
	const [savingTimeMap, setSavingTimeMap] = useState<Record<string, boolean>>(
		{}
	)
	const [tgReloading, setTgReloading] = useState(false)

	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		if (!token) {
			router.push('/auth/phone')
			return;		}

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
		}
	}

	const loadWaGroups = async (uid: string) => {
		try {
			const res = await fetch(`${BACKEND_URL}/whatsapp/groups/${uid}`, {
				cache: 'no-store',
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			})
			const json = await res.json()
			if (!json?.success) {
				message.error('Не удалось загрузить WA группы')
				setWaGroups([])
				return;			}

			// announcement не даём выбирать (как и в кампании)
			const usable = (json.groups || []).filter((g: any) => !g.is_announcement)
			setWaGroups(
				usable.map((g: any) => ({
					jid: String(g.wa_group_id),
					title: g.subject ?? null,
					participants_count: g.participants_count ?? null,
					is_restricted: g.is_restricted ?? false,
					updated_at: g.updated_at,
					send_time: g.send_time ?? null,
				}))
			)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке WA групп')
			setWaGroups([])
		}
	}

	const loadTgGroups = async (uid: string) => {
		try {
			const res = await fetch(`${BACKEND_URL}/telegram/groups/${uid}`, {
				cache: 'no-store',
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			})
			const json = await res.json()
			if (!json?.success) {
				message.error('Не удалось загрузить TG группы')
				setTgGroups([])
				return;			}

			// ✅ показываем только те TG группы, которые выбраны на странице telegram-groups (is_selected=true)
			const selectedOnly = (json.groups || []).filter(
				(g: any) => g.is_selected !== false
			)

			setTgGroups(
				selectedOnly.map((g: any) => ({
					jid: String(g.tg_chat_id),
					title: g.title ?? null,
					participants_count: g.participants_count ?? null,
					is_restricted: false,
					updated_at: g.updated_at,
					send_time: g.send_time ?? null,
				}))
			)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке TG групп')
			setTgGroups([])
		}
	}

	useEffect(() => {
		fetchMe()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (!userId) return
		loadWaGroups(userId)
		loadTgGroups(userId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId])

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

	const groupColumns: ColumnsType<UiGroupRow> = useMemo(() => {
		const cols: ColumnsType<UiGroupRow> = [
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
				render: (_: any, row: UiGroupRow) => (
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

	const currentGroups = channel === 'wa' ? waGroups : tgGroups
	const currentSelected = channel === 'wa' ? waSelected : tgSelected
	const setCurrentSelected = (keys: string[]) => {
		if (channel === 'wa') setWaSelected(keys)
		else setTgSelected(keys)
	}

	const reloadTgSelectedFromDb = async () => {
		if (!userId) return message.warning('Нет userId')
		setTgReloading(true)
		try {
			const res = await fetch(`${BACKEND_URL}/telegram/groups/${userId}`, {
				cache: 'no-store',
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			})
			const json = await res.json()
			if (!json?.success) {
				message.error('Не удалось загрузить TG группы из БД')
				return
			}
			const selectedOnly = (json.groups || []).filter(
				(g: any) => g.is_selected !== false
			)
			setTgGroups(
				selectedOnly.map((g: any) => ({
					jid: String(g.tg_chat_id),
					title: g.title ?? null,
					participants_count: g.participants_count ?? null,
					is_restricted: false,
					updated_at: g.updated_at,
					send_time: g.send_time ?? null,
				}))
			)
			message.success(`TG группы обновлены: ${selectedOnly.length}`)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке TG групп из БД')
		} finally {
			setTgReloading(false)
		}
	}

	async function setGroupSendTime(
		ch: 'wa' | 'tg',
		jid: string,
		next: string | null
	) {
		const key = `${ch}:${jid}`
		setSavingTimeMap(prev => ({ ...prev, [key]: true }))

		const updater = (rows: UiGroupRow[]) =>
			rows.map(r => (r.jid === jid ? { ...r, send_time: next } : r))

		if (ch === 'wa') setWaGroups(prev => updater(prev))
		else setTgGroups(prev => updater(prev))

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

	const saveTargetsForTemplate = async (templateId: string) => {
		setSavingTargets(true)
		try {
			// ✅ сохраняем targets отдельно по каналам
			const tasks: Array<{ ch: 'wa' | 'tg'; keys: string[] }> = [
				{ ch: 'wa', keys: waSelected },
				{ ch: 'tg', keys: tgSelected },
			]

			for (const t of tasks) {
				// eslint-disable-next-line no-await-in-loop
				const json: any = await apiPost('/templates/targets/set', {
					userId,
					templateId,
					groupJids: t.keys,
					channel: t.ch,
				})

				if (!json?.success) {
					message.error(
						`Ошибка сохранения групп (${t.ch.toUpperCase()}): ${
							json?.message || 'unknown'
						}`
					)
					return false
				}
			}

			return true
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при сохранении групп')
			return false
		} finally {
			setSavingTargets(false)
		}
	}

	const onFinish = async (values: any) => {
		if (!userId) return message.error('Нет userId')

		setSaving(true)
		try {
			const payload = {
				userId,
				title: values.title,
				text: values.text,
				media_url: mediaUrl,
				enabled: values.enabled ?? true,
				order: values.order ?? 1,
			}

			const json: any = await apiPost('/templates/create', payload)
			if (!json?.success) {
				message.error(`Ошибка создания: ${json?.message || 'unknown'}`)
				return;			}

			const templateId = String(json.templateId || '')
			if (!templateId) {
				message.error('templateId не пришёл')
				return;			}

			// ✅ сразу сохраняем выбранные группы (и WA и TG)
			const ok = await saveTargetsForTemplate(templateId)
			if (!ok) return

			message.success('Шаблон создан и группы сохранены (WA/TG)')
			router.push(`/dashboard/templates/`)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при создании шаблона')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className='tedit'>
			<div className='tedit__wrap'>
				<h1 className='tedit__title'>Создание шаблона</h1>

				<Form
					className='tedit__form'
					form={form}
					layout='vertical'
					initialValues={{ enabled: true, order: 1 }}
					onFinish={onFinish}
				>
					{/* Название */}
					<div className="tedit-cont">
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
							{/* Текст */}
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
														new Error('Нужно заполнить title или text'),
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
									Например: Введите текст сообщения. Поддерживается форматирование
									и эмодзи
								</div>
							</div>
							{/* Загрузка */}
							<div className='tedit-upload'>
								<div className='tedit-upload__label'>Прикрепите изображение</div>

								<div className='tedit-upload__row'>
									<div className='tedit-upload__drop'>
										<Upload {...uploadProps}>
											<button
												type='button'
												className='tedit-upload__btn'
												disabled={!userId || uploading}
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
												>
													Убрать
												</button>
											</div>
										) : null}
									</div>
								</div>
							</div>
						{/* Вкл/Order */}
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
						{/* Группы */}
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
								<b>{currentSelected.length}</b> · Доступно:{' '}
								<b>{currentGroups.length}</b>
							</div>

							<div className='tedit-targets__buttons'>
								<button
									type='button'
									className='tedit-pill'
									onClick={() =>
										setCurrentSelected(currentGroups.map(g => g.jid))
									}
									disabled={!currentGroups.length}
								>
									Выбрать все
								</button>

								<button
									type='button'
									className='tedit-pill'
									onClick={() => setCurrentSelected([])}
									disabled={!currentSelected.length}
								>
									Снять все
								</button>

								{channel === 'tg' ? (
									<button
										type='button'
										className='tedit-pill tedit-pill--primary'
										onClick={reloadTgSelectedFromDb}
										disabled={!userId || tgReloading}
									>
										{tgReloading ? (
											<>
												<span className='tedit-spinner' />
												Загружаем TG...
											</>
										) : (
											'Подтянуть TG из БД'
										)}
									</button>
								) : null}
							</div>

							<div className='tedit-table'>
								<Table
									rowKey='jid'
									columns={groupColumns}
									dataSource={currentGroups}
									pagination={{ pageSize: 8 }}
									rowSelection={{
										selectedRowKeys: currentSelected,
										onChange: keys => setCurrentSelected(keys as string[]),
									}}
								/>
							</div>

							<div className='tedit-targets__hint'>
								Выбор сохранится после создания шаблона. (WA и TG сохраняются
								отдельно)
							</div>
						</div>
					</div>
					
					{/* Кнопки */}
					<div className='tedit-actions'>
						<button
							className='tedit-btn tedit-btn--primary'
							type='submit'
							disabled={saving || uploading || savingTargets}
						>
							{saving ? 'Сохраняем…' : 'Сохранить шаблон'}
						</button>

						<button
							className='tedit-btn'
							type='button'
							onClick={() => router.push('/dashboard/templates')}
							disabled={saving}
						>
							Назад
						</button>
					</div>
				</Form>
			</div>
		</div>
	)

}
