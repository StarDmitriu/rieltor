// frontend/src/app/cabinet/support/page.tsx
'use client'
import './page.css'
import { useRouter } from 'next/navigation'

export default function SupportPage() {
  const router = useRouter()

  return (
		<div className='support'>
			<div className='support-card'>
				<h1 className='support-title'>Связаться с поддержкой</h1>
				<p className='support-text'>Контактные данные поддержки.</p>

				<div className='support-item'>
					<span className='support-label'>Почта:</span>
					<span className='support-value'>chatrassylka@mail.ru</span>
				</div>
				<div className='support-item'>
					<span className='support-label'>Telegram:</span>
					<span className='support-value'>@Chat_Rassylka</span>
				</div>

				<div className='support-actions'>
					<button onClick={() => router.back()}>Назад</button>
				</div>
			</div>
		</div>
	)
}
