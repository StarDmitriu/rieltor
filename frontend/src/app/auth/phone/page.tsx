'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import './page.css'
import { useNotify } from '@/ui/notify/notify'

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'

export default function LoginPage() {
	const [phone, setPhone] = useState('')
	const [loading, setLoading] = useState(false)
	const router = useRouter()
	const notify = useNotify()

	const back = () => {
		router.push(
			`/`,
		)
	}

	const sendCode = async () => {
		if (!phone.trim()) {
			notify('Введите номер телефона', { type: 'warning' })
			return;		}

		setLoading(true)
		try {
			const res = await fetch(`${backendUrl}/auth/send-code`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone: phone.trim() }),
			})

			const data = await res.json().catch(() => ({}))

			if (!data?.success) {
				notify(data?.message || 'Ошибка при отправке кода', { type: 'error', title: 'Ошибка' })
				return;			}

			router.push(
				`/auth/code?phone=${encodeURIComponent(phone.trim())}&mode=login`
			)
		} catch (err) {
			console.error(err)
			notify('Ошибка сети, попробуйте ещё раз', {
				type: 'error',
				title: 'Ошибка',
			})
		} finally {
			setLoading(false)
		}
	}

	return (
		<main className='auth'>
			<button
				type='button'
				className='auth-back__button'
				onClick={back}
			>
				Назад
			</button>

			<div className='auth__wrap'>
				<h1 className='auth__title'>Войдите в свой аккаунт</h1>
				<p className='auth__subtitle'>
					Введите номер телефона,
					<br />
					чтобы продолжить работу с сервисом
				</p>

				<section className='auth-card'>
					<input
						id='phone'
						className='auth-card__input'
						placeholder='Ваш номер телефона'
						value={phone}
						onChange={e => setPhone(e.target.value)}
						inputMode='tel'
						autoComplete='tel'
					/>

					<button
						type='button'
						className='auth-card__button'
						onClick={sendCode}
						disabled={loading}
					>
						{loading ? 'Отправляем код…' : 'Получить код'}
					</button>
				</section>

				<div className='auth__below'>
					<div className='auth__belowTitle'>Нет аккаунта?</div>

					<button
						type='button'
						className='auth__outlineBtn'
						onClick={() => router.push('/auth/register')}
					>
						Зарегистрируйтесь
					</button>
				</div>
			</div>
		</main>
	)
}
