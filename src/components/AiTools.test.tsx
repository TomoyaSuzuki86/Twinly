import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiTools} from './AiTools';
import {DailySummaryEmailSettings} from './DailySummaryEmailSettings';
import {createInitialAppState} from '@/lib/app-state';
import {clearFamilyAccessState,publishFamilyAccessState} from '@/lib/family-access-state';

const mock=vi.hoisted(()=>({call:vi.fn(),plan:vi.fn(),billing:vi.fn()}));
vi.mock('@/lib/billing',()=>({billingAction:mock.billing}));
vi.mock('@/firebase',()=>({db:null,functions:null}));
vi.mock('@/lib/ai',async importOriginal=>({...await importOriginal<typeof import('@/lib/ai')>(),callService:mock.call}));
vi.mock('@/lib/family-access',async importOriginal=>({
  ...await importOriginal<typeof import('@/lib/family-access')>(),
  setFamilyPreviewPlan:mock.plan,
}));

const free={plan:'free' as const,canPreview:true,features:{aiReview:false,aiChat:false,dailySummaryEmail:false}};
const premium={plan:'premium' as const,canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};
const summarySettings={enabled:false,hourJst:21,recipients:[],canEdit:true};

const setAccess=(access:typeof free|typeof premium)=>
  publishFamilyAccessState({key:'user:test',access,error:''});

function renderTools(){
  render(<AiTools familyId="test" app={createInitialAppState()} onSave={()=>true}/>);
  fireEvent.click(screen.getByRole('button',{name:'料金とプラン'}));
}

describe('pricing and plans',()=>{
  afterEach(()=>{cleanup();clearFamilyAccessState();});
  beforeEach(()=>{mock.call.mockReset();mock.plan.mockReset();setAccess(free);});

  it('explains Premium benefits clearly without screenshot-style demos',async()=>{
    renderTools();
    expect(await screen.findByText('Twinly Premium')).toBeInTheDocument();
    expect(screen.getByText('¥800')).toBeInTheDocument();
    expect(screen.getByText('Premiumでできること')).toBeInTheDocument();
    expect(screen.getByText('AIアドバイス & AI質問')).toBeInTheDocument();
    expect(screen.getByText('2人分のお世話ゲージ')).toBeInTheDocument();
    expect(screen.getAllByText('お世話タイミング通知').length).toBeGreaterThan(0);
    expect(screen.getByText('おむつ在庫切れ予測')).toBeInTheDocument();
    expect(screen.getAllByText('今日のまとめ通知').length).toBeGreaterThan(0);
    expect(screen.getByText('開発者より')).toBeInTheDocument();
    expect(screen.getByText(/双子育児をする私たち夫婦の/)).toBeInTheDocument();
    expect(screen.queryByText('Premiumを、画面で見てみる')).not.toBeInTheDocument();
    expect(screen.queryByText(/横にスワイプ/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'7日間無料でPremiumを試す'}).length).toBeGreaterThan(0);
    expect(screen.queryByText(/AIアドバイス生成時/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'まとめ通知の設定を保存'})).not.toBeInTheDocument();
  });

  it('uses the shared access state for the preview transition instead of a local copy',async()=>{
    mock.plan.mockImplementation(async(plan)=>plan==='premium'?premium:free);
    renderTools();
    const cta=(await screen.findAllByRole('button',{name:'7日間無料でPremiumを試す'}))[0];
    fireEvent.click(cta);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Premiumを使用中'})).toBeDisabled());
    expect(mock.plan).toHaveBeenCalledWith('premium');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('points Premium users to the feature-specific screens',async()=>{
    setAccess(premium);
    renderTools();
    expect(await screen.findByRole('button',{name:'Premiumを使用中'})).toBeDisabled();
    expect(screen.getByText(/AIアドバイスはホームから、今日のまとめ通知は「通知」タブから設定できます/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'開発確認用：無料版表示に戻す'})).toBeInTheDocument();
  });

  it('expired trials open real checkout rather than restarting preview',async()=>{
    publishFamilyAccessState({key:'user:test',error:'',access:{...free,billing:{status:'expired',trialEndsAt:1,paidUntil:0,priceYen:800,canStartTrial:false,hasSubscription:false,cancelAtPeriodEnd:false}}});
    renderTools();
    fireEvent.click(screen.getAllByRole('button',{name:'支払いへ進む'})[0]);
    await waitFor(()=>expect(mock.billing).toHaveBeenCalledWith('createFamilyCheckout'));
    expect(mock.plan).not.toHaveBeenCalled();
    expect(screen.queryByRole('button',{name:'7日間無料でPremiumを試す'})).not.toBeInTheDocument();
  });

  it('subscribers can manage their existing subscription',async()=>{
    publishFamilyAccessState({key:'user:test',error:'',access:{...premium,billing:{status:'active',trialEndsAt:1,paidUntil:Date.now()+10000,priceYen:800,canStartTrial:false,hasSubscription:true,cancelAtPeriodEnd:false}}});
    renderTools();
    fireEvent.click(screen.getByRole('button',{name:'契約・支払いを管理'}));
    await waitFor(()=>expect(mock.billing).toHaveBeenCalledWith('createFamilyBillingPortal'));
  });

  it('keeps daily-summary notification controls in notifications without refetching access',async()=>{
    setAccess(premium);
    mock.call.mockImplementation(async(name,data)=>{
      if(name==='getDailySummaryEmailSettings')return summarySettings;
      if(name==='setDailySummaryEmailSettings')return {...summarySettings,...data};
      throw new Error(`unexpected service call: ${name}`);
    });
    render(<DailySummaryEmailSettings/>);
    expect(await screen.findByText('今日のまとめ通知')).toBeInTheDocument();
    expect(await screen.findByText(/プッシュ通知を有効にしている端末/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox',{name:'毎日まとめを通知する'}));
    fireEvent.change(screen.getByLabelText('今日のまとめ通知時刻'),{target:{value:'22'}});
    fireEvent.click(screen.getByRole('button',{name:'まとめ通知の設定を保存'}));
    await waitFor(()=>expect(mock.call.mock.calls.some(([name,data])=>name==='setDailySummaryEmailSettings'&&data.enabled===true&&data.hourJst===22)).toBe(true));
    expect(mock.call.mock.calls.some(([name])=>name==='getFamilyAccess')).toBe(false);
  });
});

