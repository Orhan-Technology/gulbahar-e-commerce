import { getTranslations, setRequestLocale } from 'next-intl/server';

import { EmailSignInForm } from '@/components/auth/email-sign-in-form';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const t = await getTranslations('auth');
  /*
   * `?next=` IS HONOURED HERE — signing in from a product page has to come back
   * to that product page, and the follow / helpful / ask-a-question controls all
   * link with it already. (The header's account link does not; see the note in
   * components/shop/site-header.tsx's sibling report.)
   *
   * `//evil.example` starts with a slash and is a PROTOCOL-RELATIVE ABSOLUTE
   * URL, so `startsWith('/')` alone is an open redirect: a link mailed to a
   * customer could bounce them off-site the moment they signed in. One slash,
   * not two, and no backslash either — browsers normalise `/\` to `//`.
   */
  const redirectTo = next && /^\/(?![/\\])/.test(next) ? next : '/';

  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            Phone is the PRIMARY tab — it is the one credential every account
            has, and the recovery path for the other. Email only ever works
            once someone has set it up from Security (Prompt A1), so it stays
            the secondary, faster-in option rather than the default.
          */}
          <Tabs defaultValue="phone">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone">{t('tabPhone')}</TabsTrigger>
              <TabsTrigger value="email">{t('tabEmail')}</TabsTrigger>
            </TabsList>
            <TabsContent value="phone" className="pt-4">
              <SignInForm redirectTo={redirectTo} />
            </TabsContent>
            <TabsContent value="email" className="pt-4">
              <EmailSignInForm redirectTo={redirectTo} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
