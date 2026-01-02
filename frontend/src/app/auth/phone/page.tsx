'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
	const [phone, setPhone] = useState('')
	const [loading, setLoading] = useState(false)
	const router = useRouter()

	const sendCode = async () => {
		if (!phone) {
			alert('Введите номер телефона')
			return
		}

		setLoading(true)
		try {
			const res = await fetch('http://localhost:3000/auth/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone }),
			})

			const data = await res.json()
			console.log('POST /auth/send-code (login):', data)

			if (!data.success) {
				alert(data.message || 'Ошибка при отправке кода')
				return
			}

			// переходим на страницу кода в режиме login
			router.push(`/auth/code?phone=${encodeURIComponent(phone)}&mode=login`)
		} catch (err) {
			console.error(err)
			alert('Ошибка сети, попробуйте ещё раз')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div style={{ padding: 24, maxWidth: 400 }}>
			<h1>Вход</h1>
			<p>Введите номер телефона, чтобы войти.</p>

			<input
				placeholder='Номер телефона'
				value={phone}
				onChange={e => setPhone(e.target.value)}
				style={{ width: '100%', padding: 10, marginTop: 12, marginBottom: 12 }}
			/>

			<button
				onClick={sendCode}
				disabled={loading}
				style={{ padding: '10px 16px' }}
			>
				{loading ? 'Отправляем код...' : 'Получить код'}
			</button>

			<div style={{ marginTop: 16 }}>
				Нет аккаунта?{' '}
				<button
					type='button'
					onClick={() => router.push('/auth/register')}
					style={{
						border: 'none',
						background: 'none',
						color: 'blue',
						textDecoration: 'underline',
						cursor: 'pointer',
						padding: 0,
					}}
				>
					Зарегистрироваться
				</button>
			</div>
		</div>
	)
}
