import { Manrope } from 'next/font/google'
import { NotifyProvider } from '@/ui/notify/notify'
import './globals.css'
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', ],})

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='en' className={manrope.className}>
			<body>
				<NotifyProvider>{children}</NotifyProvider>
			</body>
		</html>
	)
}
