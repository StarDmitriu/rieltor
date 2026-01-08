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
} from 'antd'
import type { UploadProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UploadOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { apiPost } from '@/lib/api'

const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'

type UiGroupRow = {
	jid: string
	title: string | null
	participants_count: number | null
	is_restricted?: boolean | null
	updated_at: string
}

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

	const token = Cookies.get('token') || ''

	const fetchMe = async () => {
		if (!token) {
			router.push('/auth/phone')
			return
		}

		try {
			const res = await fetch(`${BACKEND_URL}/auth/me`, {
				headers: { Authorization: `Bearer ${token}` },
				cache: 'no-store',
			})
			const json = await res.json()
			if (!json?.success) {
				Cookies.remove('token')
				router.push('/auth/phone')
				return
			}
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
			})
			const json = await res.json()
			if (!json?.success) {
				message.error('Не удалось загрузить WA группы')
				setWaGroups([])
				return
			}

			// announcement не даём выбирать (как и в кампании)
			const usable = (json.groups || []).filter((g: any) => !g.is_announcement)
			setWaGroups(
				usable.map((g: any) => ({
					jid: String(g.wa_group_id),
					title: g.subject ?? null,
					participants_count: g.participants_count ?? null,
					is_restricted: g.is_restricted ?? false,
					updated_at: g.updated_at,
				}))
			)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке WA групп')
		}
	}

	const loadTgGroups = async (uid: string) => {
		try {
			const res = await fetch(`${BACKEND_URL}/telegram/groups/${uid}`, {
				cache: 'no-store',
			})
			const json = await res.json()
			if (!json?.success) {
				message.error('Не удалось загрузить TG группы')
				setTgGroups([])
				return
			}

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
				}))
			)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при загрузке TG групп')
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

	const groupColumns: ColumnsType<UiGroupRow> = useMemo(
		() => [
			{
				title: 'Название',
				dataIndex: 'title',
				key: 'title',
				render: (v: any) =>
					v || <span style={{ opacity: 0.6 }}>без названия</span>,
			},
			{
				title: 'Участники',
				dataIndex: 'participants_count',
				key: 'participants_count',
				width: 120,
				render: (v: any) => (typeof v === 'number' ? v : '—'),
			},
			{
				title: 'Флаги',
				key: 'flags',
				width: 160,
				render: (_: any, row: any) => (
					<Space>
						{row.is_restricted ? <Tag color='red'>restricted</Tag> : null}
					</Space>
				),
			},
		],
		[]
	)

	const currentGroups = channel === 'wa' ? waGroups : tgGroups
	const currentSelected = channel === 'wa' ? waSelected : tgSelected
	const setCurrentSelected = (keys: string[]) => {
		if (channel === 'wa') setWaSelected(keys)
		else setTgSelected(keys)
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
				return
			}

			const templateId = String(json.templateId || '')
			if (!templateId) {
				message.error('templateId не пришёл')
				return
			}

			// ✅ сразу сохраняем выбранные группы (и WA и TG)
			const ok = await saveTargetsForTemplate(templateId)
			if (!ok) return

			message.success('Шаблон создан и группы сохранены (WA/TG)')
			router.push(`/dashboard/templates/${templateId}`)
		} catch (e) {
			console.error(e)
			message.error('Ошибка сети при создании шаблона')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div style={{ padding: 24, maxWidth: 980 }}>
			<h1>Создание шаблона</h1>

			<div style={{ marginBottom: 12, opacity: 0.75 }}>
				userId: <code>{userId || '—'}</code>
			</div>

			<Form
				form={form}
				layout='vertical'
				initialValues={{ enabled: true, order: 1 }}
				onFinish={onFinish}
			>
				<Form.Item label='Название шаблона' name='title'>
					<Input placeholder='Например: Акция / Подбор объектов / Описание квартиры' />
				</Form.Item>

				<Form.Item
					label='Текст сообщения'
					name='text'
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
					<Input.TextArea rows={6} placeholder='Введите текст сообщения' />
				</Form.Item>

				<Form.Item label='Медиа (картинка/видео)'>
					<Space direction='vertical' style={{ width: '100%' }}>
						<Upload {...uploadProps}>
							<Button
								icon={<UploadOutlined />}
								loading={uploading}
								disabled={!userId}
							>
								Выбрать файл
							</Button>
						</Upload>

						{mediaUrl ? (
							<div style={{ fontSize: 13 }}>
								Текущая ссылка:{' '}
								<a href={mediaUrl} target='_blank' rel='noreferrer'>
									открыть
								</a>{' '}
								<Button
									size='small'
									style={{ marginLeft: 8 }}
									onClick={() => setMediaUrl(null)}
								>
									Убрать
								</Button>
							</div>
						) : (
							<div style={{ fontSize: 13, opacity: 0.7 }}>Файл не выбран</div>
						)}
					</Space>
				</Form.Item>

				<Space wrap>
					<Form.Item label='Включен' name='enabled' valuePropName='checked'>
						<Switch />
					</Form.Item>

					<Form.Item label='Order' name='order'>
						<InputNumber min={1} />
					</Form.Item>
				</Space>

				{/* ✅ ВЫБОР ГРУПП WA/TG */}
				<div
					style={{
						marginTop: 18,
						padding: 12,
						border: '1px solid #eee',
						borderRadius: 12,
					}}
				>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>
						Куда отправлять этот шаблон
					</div>

					<div style={{ marginBottom: 10 }}>
						<Segmented
							value={channel}
							onChange={v => setChannel(v as any)}
							options={[
								{ label: 'WhatsApp', value: 'wa' },
								{ label: 'Telegram', value: 'tg' },
							]}
						/>
					</div>

					<div style={{ marginBottom: 10, opacity: 0.75 }}>
						Канал: <b>{channel.toUpperCase()}</b> | Выбрано:{' '}
						<b>{currentSelected.length}</b> | Доступно:{' '}
						<b>{currentGroups.length}</b>
					</div>

					<Space style={{ marginBottom: 10 }} wrap>
						<Button
							onClick={() => setCurrentSelected(currentGroups.map(g => g.jid))}
							disabled={!currentGroups.length}
						>
							Выбрать все
						</Button>
						<Button
							onClick={() => setCurrentSelected([])}
							disabled={!currentSelected.length}
						>
							Снять все
						</Button>
					</Space>

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

					<div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
						Выбор сохраняется после создания шаблона. (WA и TG сохраняются
						отдельно)
					</div>
				</div>

				<Space style={{ marginTop: 12 }}>
					<Button
						type='primary'
						htmlType='submit'
						loading={saving}
						disabled={uploading || savingTargets}
					>
						Сохранить шаблон
					</Button>

					<Button
						onClick={() => router.push('/dashboard/templates')}
						disabled={saving}
					>
						Назад
					</Button>
				</Space>
			</Form>
		</div>
	)
}
