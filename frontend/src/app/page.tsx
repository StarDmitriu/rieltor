/*'use client'

import { useState } from 'react'

export default function Home() {
	const [phone, setPhone] = useState('')

	const sendCode = async () => {
		await fetch('http://localhost:3000/auth/send-code', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ phone }),
		})

		window.location.href = `/auth/code?phone=${phone}`
	}

	return (
		<div style={{ padding: 40 }}>
			<h1>Вход по номеру телефона</h1>

			<input
				type='text'
				placeholder='Введите номер'
				value={phone}
				onChange={e => setPhone(e.target.value)}
				style={{
					padding: 12,
					fontSize: 18,
					width: 250,
					border: '1px solid #ccc',
					borderRadius: 8,
					marginBottom: 12,
					display: 'block',
				}}
			/>

			<button
				onClick={sendCode}
				style={{
					padding: '12px 24px',
					fontSize: 18,
					background: '#0070f3',
					color: 'white',
					border: 'none',
					borderRadius: 8,
					cursor: 'pointer',
				}}
			>
				Получить код
			</button>
		</div>
	)
}
*/

import { redirect } from 'next/navigation'

export default function Home() {
	redirect('/auth/phone')
}
