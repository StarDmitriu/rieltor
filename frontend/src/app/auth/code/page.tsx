'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import './page.css'

function maskPhone(p: string) {
	if (!p) return ''
	// простая маска: оставим + и последние 2-3 символа, остальное заменим
	const s = p.trim()
	if (s.length <= 4) return s
	const tail = s.slice(-3)
	return s.slice(0, 2) + ' XXX XXX-XX-' + tail
}

function CodeInner() {
	const params = useSearchParams()
	const router = useRouter()

	const phone = params.get('phone') || ''
	const mode = params.get('mode') || 'login' // login | register

	const [code, setCode] = useState('')
	const [loading, setLoading] = useState(false)
	const [resendLoading, setResendLoading] = useState(false)

	const verify = async () => {
		if (!code.trim()) {
			alert('Введите код')
			return
		}

		setLoading(true)
		try {
			let body: any = { phone, code: code.trim() }

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

			const res = await fetch('/api/auth/verify-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			const data = await res.json().catch(() => ({}))

			if (!res.ok || !data?.success) {
				if (data?.message === 'user_not_found' && mode === 'login') {
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

				alert(data?.message || 'Ошибка при проверке кода')
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
			const res = await fetch('/api/auth/send-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone }),
			})

			const data = await res.json().catch(() => ({}))

			if (!res.ok || !data?.success) {
				alert(data?.message || 'Не удалось отправить код')
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
		<div className='auth'>
			<div className='auth__wrap'>
				<h1 className='auth__title'>Подтвердите вход</h1>

				<div className='auth__subtitle'>
					Мы отправили код подтверждения
					<br />
					на номер {phone}
				</div>

				<div className='auth-card'>
					<input
						className='auth-card__input'
						placeholder='Введите 4-значный код'
						value={code}
						onChange={e => setCode(e.target.value)}
						inputMode='numeric'
						autoComplete='one-time-code'
						maxLength={6}
					/>

					<button
						className='auth-btn auth-card__button'
						onClick={verify}
						disabled={loading}
						type='button'
					>
						{loading ? 'Проверяем...' : 'Введите 4-значный код'}
					</button>
				</div>

				<div className='auth-card auth-card--secondary'>
					<div className='auth__belowTitle'>Не пришёл код?</div>

					<button
						className='auth-btn auth-card__button'
						onClick={resendCode}
						disabled={resendLoading}
						type='button'
					>
						{resendLoading ? 'Отправляем...' : 'Отправить ещё раз'}
					</button>
				</div>
			</div>
		</div>
	)
}

export default function CodePage() {
	return (
		<Suspense fallback={<div className='auth'>Загрузка...</div>}>
			<CodeInner />
		</Suspense>
	)
}
