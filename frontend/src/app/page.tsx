// frontend/src/app/page.tsx
'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import './page.css'

export default function HomePage() {
	const [menuOpen, setMenuOpen] = useState(false)


	const [fullName, setFullName] = useState('')
	const [phone, setPhone] = useState('')
	const [birthDate, setBirthDate] = useState('')
	const [city, setCity] = useState('')
	const [telegram, setTelegram] = useState('')

	const [pdConsent, setPdConsent] = useState(false)
	const [marketingConsent, setMarketingConsent] = useState(false)

	const [sending, setSending] = useState(false)


	useEffect(() => {
		// блокируем скролл при открытом меню
		document.body.style.overflow = menuOpen ? 'hidden' : ''
		return () => {
			document.body.style.overflow = ''
		}
	}, [menuOpen])

	const closeMenu = () => setMenuOpen(false)

	

	return (
		<main className='landing'>
			<header className='landing-header'>
				<div className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
					<div className='mobile-menu__backdrop' onClick={closeMenu} />
					<div className='mobile-menu__panel'>
						<div className='mobile-menu__top'>
							<div className='mobile-brand'>
								<div className='brand-title'>Чат</div>
								<div className='brand-title'>Рассылка</div>
							</div>
							<button
								className='mobile-close'
								onClick={closeMenu}
								aria-label='Закрыть меню'
							>
								✕
							</button>
						</div>

						<div className='mobile-links'>
							<a className='mobile-link' href='#about' onClick={closeMenu}>
								О нас
							</a>
							<a className='mobile-link' href='#how' onClick={closeMenu}>
								Как работает сервис?
							</a>
							<a className='mobile-link' href='#pricing' onClick={closeMenu}>
								Тарифы
							</a>
							<Link className='mobile-link' href='/cabinet' onClick={closeMenu}>
								Личный кабинет
							</Link>
						</div>
					</div>
				</div>

				<div className='container header-row'>
					<div className='brand'>
						<div className='brand-title'>Чат</div>
						<div className='brand-title'>Рассылка</div>
					</div>

					{/* Desktop nav */}
					<nav className='nav nav-desktop'>
						<a className='pill' href='#about'>
							О нас
						</a>
						<a className='pill' href='#how'>
							Как работает сервис?
						</a>
						<a className='pill' href='#pricing'>
							Тарифы
						</a>
						<Link className='pill' href='/cabinet'>
							Личный кабинет
						</Link>
					</nav>

					{/* Burger button (mobile) */}
					<button
						className={`burger ${menuOpen ? 'is-open' : ''}`}
						aria-label='Открыть меню'
						aria-expanded={menuOpen}
						onClick={() => setMenuOpen(v => !v)}
					>
						<span />
						<span />
						<span />
					</button>
				</div>
			</header>

			<section className='hero'>
				<div className='container'>
					<div className='hero-card'>
						<h1 className='hero-title'>ЧатРассылка</h1>
						<p className='hero-subtitle'>
							Автоматическая рассылка сообщений
							<br />
							по группам в WhatsApp
						</p>

						<a className='hero-button' href='#pricing'>
							Начать сотрудничество
						</a>
					</div>
				</div>
			</section>

			<section id='about' className='section section-about'>
				<div className='container'>
					<h2 className='section-title'>О нас</h2>

					<p className='section-text'>
						Сервис «ЧатРассылка» помогает Вам ежедневно публиковать объявления в
						группы WhatsApp автоматически - без ручной рассылки, независимо от
						работы интернета в городе
					</p>

					<div className='stats'>
						<div className='stat'>
							<div className='stat-value'>300+</div>
							<div className='stat-label'>
								специалистов уже
								<br />
								используют наш сервис
							</div>
						</div>

						<div className='stat'>
							<div className='stat-value'>24/7</div>
							<div className='stat-label'>
								доставляем Ваши сообщения
								<br />
								независимо от сбоев интернета
							</div>
						</div>

						<div className='stat'>
							<div className='stat-value'>100%</div>
							<div className='stat-label'>
								доставляемость
								<br />
								сообщений в Ваши группы
							</div>
						</div>
					</div>
				</div>
			</section>

			<section id='how' className='section section-how'>
				<div className='container'>
					<h2 className='section-title'>Как работает сервис?</h2>

					<div className='how-grid'>
						<div className='how-card'>
							<div className='how-num'>1</div>
							<div className='how-head'>
								Подготовка аккаунта
								<br />
								WhatsApp
							</div>
							<p className='how-text'>
								<span className='how-text__span'>
									{' '}
									Для эффективной рассылки
								</span>{' '}
								важно, чтобы Ваш аккаунт WhatsApp должен быть участником групп
							</p>
							<p className='how-text'>
								Если Вы не являетесь участником группы или Вы заблокированы в
								этой группе, Ваше сообщение{' '}
								<span className='how-text__span'>не будет доставлено</span> в
								эту группу
							</p>
						</div>

						<div className='how-card'>
							<div className='how-num'>2</div>
							<div className='how-head'>
								Подключение Вашего
								<br />
								аккаунта WhatsApp
							</div>
							<p className='how-text'>
								После{' '}
								<span className='how-text__span'>личной консультации</span>{' '}
								<br />
								Вы получите доступ к личному кабинету
							</p>
							<p className='how-text'>
								Совершите вход в систему и выполните синхронизацию Ваших
								WhatsApp
							</p>
							<p className='how-text'>
								Мы автоматически загрузим группы, <br />в которых Вы состоите
							</p>
						</div>

						<div className='how-card'>
							<div className='how-num'>3</div>
							<div className='how-head'>
								Добавление
								<br />
								Ваших объявлений
							</div>
							<p className='how-text'>
								После загрузки Ваших групп, Вам необходимо{' '}
								<span className='how-text__span'>создать объявления</span>
								для рассылки
							</p>
							<p className='how-text'>
								<span className='how-text__span'>Всего несколько кликов: </span>
								добавляете фото, текст и выбираете группы, в которые система
								автоматически будет отправлять сообщения
							</p>
						</div>

						<div className='how-card'>
							<div className='how-num'>4</div>
							<div className='how-head'>
								Автоматическая рассылка
								<br />
								по расписанию
							</div>
							<div className='how-text'>
								Настройте время отправки{' '}
								<span className='how-text__span'>1 раз</span> — и система{' '}
								<span className='how-text__span'>сама ежедневно</span> будет
								публиковать <br />
								Ваши объявления в группы независимо от наличия подключения к
								интернету
							</div>
							<div className='how-text'>
								Теперь Вам <span className='how-text__span'>не нужно</span>{' '}
								тратить
								<br />{' '}
								<span className='how-text__span'>
									по несколько часов в день
								</span>{' '}
								на рассылки
							</div>
						</div>
					</div>
				</div>
			</section>

			<section id='pricing' className='section section-pricing'>
				<div className='container'>
					<h2 className='section-title'>Тарифы</h2>

					<p className='pricing-text'>
						Единый тариф по рассылке <br /> Стоимость <b>не зависит</b> от
						количества групп и сообщений отправляемых в день
					</p>

					<div className='pricing-price'>1999 ₽</div>

					<div className='trial-card'>
						<div className='trial-title'>3 дня бесплатного доступа</div>
						<div className='trial-subtitle'>
							Попробуйте <b>бесплатно все функции</b> сервиса без ограничений
						</div>

						<div className='trial-steps'>
							<div className='trial-pill'>Подключайте WhatsApp</div>
							<div className='trial-arrow'>→</div>
							<div className='trial-pill'>Создавайте шаблоны</div>
							<div className='trial-arrow'>→</div>
							<div className='trial-pill'>Отправляйте рассылки</div>
						</div>

						<div className='trial-down'>↓</div>

						<Link className='trial-main trial-pill ' href='/cabinet'>
							Перейти к подключению WhatsApp
						</Link>
					</div>
				</div>
			</section>

			<section className='section section-contact'>
				<div className='container'>
					<h2 className='section-title'>Форма обратной связи</h2>

					<form
						className='contact-card'
						onSubmit={async e => {
							e.preventDefault()

							if (!pdConsent) {
								alert('Нужно согласие на обработку персональных данных')
								return
							}

							// простая проверка обязательных
							if (!fullName.trim()) return alert('Заполни поле "Имя и фамилия"')
							if (!phone.trim()) return alert('Заполни поле "Номер телефона"')
							if (!birthDate.trim())
								return alert('Заполни поле "Дата рождения"')
							if (!city.trim()) return alert('Заполни поле "Город"')
							if (!pdConsent)
								return alert('Нужно согласие на обработку персональных данных')

							try {
								setSending(true)

								const res = await fetch('/api/leads', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										full_name: fullName.trim(),
										phone: phone.trim(),
										birth_date: birthDate.trim(),
										city: city.trim(),
										telegram: telegram.trim() || null,
										consent_personal: pdConsent,
										consent_marketing: marketingConsent,
									}),
								})

								const data = await res.json().catch(() => ({}))

								if (!res.ok || !data?.success) {
									alert(data?.message || 'Не удалось отправить заявку')
									return
								}

								alert('Заявка отправлена!')

								// очистим форму
								setFullName('')
								setPhone('')
								setBirthDate('')
								setCity('')
								setTelegram('')
								setPdConsent(false)
								setMarketingConsent(false)
							} catch (err) {
								console.error(err)
								alert('Ошибка сети')
							} finally {
								setSending(false)
							}
						}}
					>
						<input
							className='input'
							placeholder='Имя и фамилия *'
							value={fullName}
							onChange={e => setFullName(e.target.value)}
						/>

						<input
							className='input'
							placeholder='Номер телефона *'
							value={phone}
							onChange={e => setPhone(e.target.value)}
						/>

						<input
							className='input'
							type='date'
							value={birthDate ?? ''}
							onChange={e => setBirthDate(e.target.value)}
						/>

						<input
							className='input'
							placeholder='Город *'
							value={city}
							onChange={e => setCity(e.target.value)}
						/>

						<input
							className='input'
							placeholder='Ник в телеграм'
							value={telegram}
							onChange={e => setTelegram(e.target.value)}
						/>

						<div className='check-cont'>
							<label className='check'>
								<input
									type='checkbox'
									checked={pdConsent}
									onChange={e => setPdConsent(e.target.checked)}
								/>
								<span>
									Даю согласие на{' '}
									<a
										href='/docs/pd-consent.pdf'
										target='_blank'
										rel='noreferrer'
									>
										обработку персональных данных
									</a>
								</span>
							</label>

							<label className='check'>
								<input
									type='checkbox'
									checked={marketingConsent}
									onChange={e => setMarketingConsent(e.target.checked)}
								/>
								<span>Даю согласие на получение информации и напоминаний</span>
							</label>
						</div>
						<button
							className='contact-button'
							disabled={sending}
							type='submit'
						>
							{sending ? 'Отправка...' : 'Отправить заявку'}
						</button>
					</form>

					<footer className='footer-card'>
						<div className='footer-nav'>
							<a href='#about'>О нас</a>
							<a href='#how'>Как работает сервис?</a>
							<a href='#pricing'>Тарифы</a>
							<Link href='/cabinet'>Личный кабинет</Link>
						</div>

						<div className='footer-title'>ЧатРассылка</div>
					</footer>
				</div>
			</section>
		</main>
	)
}
