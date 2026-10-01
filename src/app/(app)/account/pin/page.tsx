import ChangePinForm from './ChangePinForm';

export default function ChangePinPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Change PIN</h1>
      <ChangePinForm />
    </div>
  );
}
