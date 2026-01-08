'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Cookies from 'js-cookie'

function CodeInner() {
	const params = useSearchParams()
	const router = useRouter()

	const phone = params.get('phone') || ''
	const mode = params.get('mode') || 'login' // login | register

	const [code, setCode] = useState('')
	const [loading, setLoading] = useState(false)
	const [resendLoading, setResendLoading] = useState(false)

	const verify = async () => {
		if (!code) {
			alert('Введите код')
			return
		}

		setLoading(true)
		try {
			let body: any = { phone, code }

			if (mode === 'register' && typeof window !== 'undefined') {
				const raw = sessionStorage.getItem('registerProfile')
				if (raw) {
					try {
						const profile = JSON.parse(raw)
						body = { ...body, ...profile }
					} catch (e) {
						console.error('Ошибка парсинга registerProfile:', e)
					}
				}
			}

			const res = await fetch('http://localhost:3000/auth/verify-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			const data = await res.json()
			console.log('POST /auth/verify-code:', data)

			if (!data.success) {
				if (data.message === 'user_not_found' && mode === 'login') {
					const go = confirm(
						'Пользователь с таким номером не найден. Зарегистрироваться?'
					)
					if (go) {
						if (typeof window !== 'undefined') {
							sessionStorage.removeItem('registerProfile')
						}
						router.push(`/auth/register?phone=${encodeURIComponent(phone)}`)
					}
					return
				}

				alert(data.message || 'Ошибка при проверке кода')
				return
			}

			if (mode === 'register' && typeof window !== 'undefined') {
				sessionStorage.removeItem('registerProfile')
			}

			Cookies.set('token', data.token, { expires: 30 })
			router.push('/cabinet')
		} catch (err) {
			console.error(err)
			alert('Ошибка сети, попробуйте ещё раз')
		} finally {
			setLoading(false)
		}
	}

	const resendCode = async () => {
		if (!phone) {
			alert('Телефон отсутствует')
			return
		}

		setResendLoading(true)
		try {
			const res = await fetch('http://localhost:3000/auth/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone }),
			})

			const data = await res.json()
			console.log('POST /auth/send-code:', data)

			if (!data.success) {
				alert(data.message || 'Не удалось отправить код')
				return
			}

			alert('Код отправлен повторно!')
		} catch (err) {
			console.error(err)
			alert('Ошибка сети при повторной отправке')
		} finally {
			setResendLoading(false)
		}
	}

	return (
		<div style={{ padding: 24 }}>
			<h2>
				Введите код, отправленный на {phone}{' '}
				{mode === 'register' ? '(регистрация)' : '(вход)'}
			</h2>

			<div style={{ marginTop: 12 }}>
				<input
					placeholder='Код из SMS'
					value={code}
					onChange={e => setCode(e.target.value)}
					style={{ padding: 10, width: 160, marginRight: 8 }}
				/>

				<button onClick={verify} disabled={loading} style={{ padding: 10 }}>
					{loading ? 'Проверяем...' : 'Подтвердить'}
				</button>
			</div>

			<div style={{ marginTop: 20 }}>
				<button
					onClick={resendCode}
					disabled={resendLoading}
					style={{ padding: 10 }}
				>
					{resendLoading ? 'Отправляем...' : 'Отправить код повторно'}
				</button>
			</div>
		</div>
	)
}

export default function CodePage() {
	return (
		<Suspense fallback={<div style={{ padding: 24 }}>Загрузка...</div>}>
			<CodeInner />
		</Suspense>
	)
}
