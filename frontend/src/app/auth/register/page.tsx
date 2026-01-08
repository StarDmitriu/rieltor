'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RegisterInner() {
	const router = useRouter()
	const params = useSearchParams()

	const initialPhone = useMemo(() => params.get('phone') || '', [params])
	const ref = useMemo(() => params.get('ref') || '', [params])

	const [fullName, setFullName] = useState('')
	const [phone, setPhone] = useState(initialPhone)
	const [gender, setGender] = useState('')
	const [telegram, setTelegram] = useState('')
	const [birthday, setBirthday] = useState('')
	const [loading, setLoading] = useState(false)

	const sendCode = async () => {
		if (!fullName.trim()) {
			alert('Введите имя')
			return
		}
		if (!phone.trim()) {
			alert('Введите номер телефона')
			return
		}

		setLoading(true)
		try {
			// 1) отправляем код
			const res = await fetch('http://localhost:3000/auth/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone }),
			})

			const data = await res.json()
			console.log('POST /auth/send-code (register):', data)

			if (!data.success) {
				alert(data.message || 'Ошибка при отправке кода')
				return
			}

			// 2) сохраняем профиль
			const profile = {
				full_name: fullName.trim(),
				gender: gender || null,
				telegram: telegram || null,
				birthday: birthday || null,
			}

			if (typeof window !== 'undefined') {
				sessionStorage.setItem('registerProfile', JSON.stringify(profile))
			}

			// 3) идём на ввод кода + прокидываем ref
			router.push(
				`/auth/code?phone=${encodeURIComponent(
					phone
				)}&mode=register&ref=${encodeURIComponent(ref)}`
			)
		} catch (err) {
			console.error(err)
			alert('Ошибка сети, попробуйте ещё раз')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div style={{ padding: 24, maxWidth: 500 }}>
			<h1>Регистрация</h1>
			<p>Заполните данные и подтвердите номер телефона по SMS-коду.</p>

			<div style={{ marginTop: 12 }}>
				<label>
					Имя:
					<br />
					<input
						value={fullName}
						onChange={e => setFullName(e.target.value)}
						style={{ width: '100%', padding: 8, marginTop: 4 }}
					/>
				</label>
			</div>

			<div style={{ marginTop: 12 }}>
				<label>
					Номер телефона:
					<br />
					<input
						value={phone}
						onChange={e => setPhone(e.target.value)}
						style={{ width: '100%', padding: 8, marginTop: 4 }}
					/>
				</label>
			</div>

			<div style={{ marginTop: 12 }}>
				<label>
					Пол:
					<br />
					<select
						value={gender}
						onChange={e => setGender(e.target.value)}
						style={{ width: '100%', padding: 8, marginTop: 4 }}
					>
						<option value=''>Не указан</option>
						<option value='m'>Мужской</option>
						<option value='f'>Женский</option>
					</select>
				</label>
			</div>

			<div style={{ marginTop: 12 }}>
				<label>
					Telegram:
					<br />
					<input
						value={telegram}
						onChange={e => setTelegram(e.target.value)}
						placeholder='@username'
						style={{ width: '100%', padding: 8, marginTop: 4 }}
					/>
				</label>
			</div>

			<div style={{ marginTop: 12 }}>
				<label>
					Дата рождения:
					<br />
					<input
						type='date'
						value={birthday}
						onChange={e => setBirthday(e.target.value)}
						style={{ padding: 8, marginTop: 4 }}
					/>
				</label>
			</div>

			<button
				onClick={sendCode}
				disabled={loading}
				style={{ marginTop: 16, padding: '10px 16px' }}
			>
				{loading ? 'Отправляем код...' : 'Получить код и продолжить'}
			</button>

			<div style={{ marginTop: 16 }}>
				Уже есть аккаунт?{' '}
				<button
					type='button'
					onClick={() => router.push('/auth/phone')}
					style={{
						border: 'none',
						background: 'none',
						color: 'blue',
						textDecoration: 'underline',
						cursor: 'pointer',
						padding: 0,
					}}
				>
					Войти
				</button>
			</div>
		</div>
	)
}

export default function RegisterPage() {
	return (
		<Suspense fallback={<div style={{ padding: 24 }}>Загрузка...</div>}>
			<RegisterInner />
		</Suspense>
	)
}
